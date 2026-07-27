#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import ssl
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


MAX_REQUEST_BYTES = 1_000_000
MAX_RESPONSE_BYTES = 5_000_000
API_ROUTES = {'/api/library': 'library', '/api/running': 'running'}


def json_bytes(payload):
    return json.dumps(payload, ensure_ascii=False).encode('utf-8')


def encode_component(value):
    return quote(str(value), safe="~()*!.'-_")


def sign_upstream_url(raw_url, method, query, body, secret, email):
    parsed = urlsplit(raw_url)
    pairs = parse_qsl(query, keep_blank_values=True)
    if any(key.startswith('_proxy_') for key, _ in pairs):
        raise ValueError('Reserved query parameter')

    timestamp = str(int(time.time()))
    nonce = secrets.token_urlsafe(18)
    body_hash = hashlib.sha256(body).hexdigest()
    pairs.extend([
        ('_proxy_ts', timestamp),
        ('_proxy_nonce', nonce),
        ('_proxy_method', method),
        ('_proxy_email', email),
        ('_proxy_body_sha256', body_hash)
    ])
    canonical_query = '&'.join(
        f'{encode_component(key)}={encode_component(value)}'
        for key, value in sorted(pairs, key=lambda pair: f'{encode_component(pair[0])}={encode_component(pair[1])}')
    )
    canonical = '\n'.join([method, timestamp, nonce, canonical_query, body_hash])
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode('utf-8'), canonical.encode('utf-8'), hashlib.sha256).digest()
    ).decode('ascii').rstrip('=')
    pairs.append(('_proxy_sig', signature))
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(pairs), ''))


def load_proxy_config(path):
    if not path:
        return {'upstreams': {}}
    metadata = os.stat(path)
    if metadata.st_mode & 0o077:
        raise PermissionError('Proxy config must not be readable by group or others')
    with open(path, encoding='utf-8') as config_file:
        config = json.load(config_file)

    upstreams = config.get('upstreams', {})
    for name in API_ROUTES.values():
        raw_url = str(upstreams.get(name, ''))
        parsed = urlsplit(raw_url)
        if (parsed.scheme != 'https' or parsed.hostname != 'script.google.com'
                or not parsed.path.startswith('/macros/s/') or not parsed.path.endswith('/exec')):
            raise ValueError(f'Invalid {name} upstream URL')
    secret = str(config.get('hmacSecret', ''))
    if secret and len(secret) < 32:
        raise ValueError('hmacSecret must contain at least 32 characters')
    return config


class PrivateSiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, proxy_config=None, **kwargs):
        self.proxy_config = proxy_config or {'upstreams': {}}
        super().__init__(*args, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests")
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()')
        super().end_headers()

    def do_GET(self):
        if urlsplit(self.path).path in API_ROUTES:
            self.proxy_api_request()
            return
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path in API_ROUTES:
            self.proxy_api_request()
            return
        self.send_json_error(405, 'Method not allowed')

    def send_json_error(self, status, message):
        body = json_bytes({'status': 'error', 'ok': False, 'message': message})
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_api_request(self):
        parsed_request = urlsplit(self.path)
        upstream_name = API_ROUTES.get(parsed_request.path)
        upstream = self.proxy_config.get('upstreams', {}).get(upstream_name)
        if not upstream:
            self.send_json_error(503, 'Private API is not configured')
            return

        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self.send_json_error(400, 'Invalid content length')
            return
        if length < 0 or length > MAX_REQUEST_BYTES:
            self.send_json_error(413, 'Request too large')
            return
        body = self.rfile.read(length) if self.command == 'POST' else b''
        if len(body) > MAX_REQUEST_BYTES:
            self.send_json_error(413, 'Request too large')
            return

        upstream_parts = urlsplit(upstream)
        upstream_url = urlunsplit((upstream_parts.scheme, upstream_parts.netloc, upstream_parts.path, parsed_request.query, ''))
        signing_secret = str(self.proxy_config.get('hmacSecret', ''))
        if signing_secret:
            try:
                upstream_url = sign_upstream_url(
                    upstream_url,
                    self.command,
                    parsed_request.query,
                    body,
                    signing_secret,
                    str(self.proxy_config.get('proxyEmail', 'local-zerotier'))
                )
            except ValueError as error:
                self.send_json_error(400, str(error))
                return

        request_headers = {'Accept': 'application/json'}
        content_type = self.headers.get('Content-Type')
        if content_type:
            request_headers['Content-Type'] = content_type
        request = Request(
            upstream_url,
            data=body if self.command == 'POST' else None,
            headers=request_headers,
            method=self.command
        )

        try:
            with urlopen(request, timeout=30) as response:
                response_body = response.read(MAX_RESPONSE_BYTES + 1)
                upstream_status = response.status
        except HTTPError as error:
            response_body = error.read(MAX_RESPONSE_BYTES + 1)
            upstream_status = error.code
        except (URLError, TimeoutError):
            self.send_json_error(502, 'Private API upstream is unavailable')
            return

        if len(response_body) > MAX_RESPONSE_BYTES:
            self.send_json_error(502, 'Private API response is too large')
            return
        try:
            json.loads(response_body.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json_error(502, 'Private API returned an invalid response')
            return

        status = upstream_status if 200 <= upstream_status < 300 else 502
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    def list_directory(self, path):
        self.send_error(404, 'Directory listing is disabled')
        return None

    def log_message(self, message_format, *args):
        print(f'{self.client_address[0]} - {message_format % args}', flush=True)


def main():
    parser = argparse.ArgumentParser(description='Serve the allowlisted private site over HTTPS.')
    parser.add_argument('--bind', required=True)
    parser.add_argument('--port', type=int, default=8443)
    parser.add_argument('--directory', required=True)
    parser.add_argument('--certificate', required=True)
    parser.add_argument('--private-key', required=True)
    parser.add_argument('--proxy-config')
    arguments = parser.parse_args()

    proxy_config = load_proxy_config(arguments.proxy_config)
    handler = partial(PrivateSiteHandler, directory=arguments.directory, proxy_config=proxy_config)
    server = ThreadingHTTPServer((arguments.bind, arguments.port), handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(arguments.certificate, arguments.private_key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f'Private HTTPS server listening on {arguments.bind}:{arguments.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
