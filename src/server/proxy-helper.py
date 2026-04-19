"""
TCP relay proxy — bridges Node.js (which macOS blocks from local network TCP)
to the Samsung Frame TV using /usr/bin/python3 (which macOS allows).

Usage: python3 proxy-helper.py <target_host> <target_port>

Starts a server on 127.0.0.1 on a random available port.
Prints the assigned port number to stdout (Node.js reads this).
Each connection is relayed bidirectionally to (target_host, target_port).
"""
import asyncio
import ipaddress
import sys


def _parse_args() -> tuple[str, int]:
    if len(sys.argv) != 3:
        print("Usage: proxy-helper.py <target_host> <target_port>", file=sys.stderr)
        sys.exit(1)
    host = sys.argv[1]
    try:
        addr = ipaddress.IPv4Address(host)
    except ValueError:
        print(f"Invalid IPv4 address: {host}", file=sys.stderr)
        sys.exit(1)
    # Block loopback and link-local to prevent SSRF
    if addr.is_loopback or addr.is_link_local or addr.is_unspecified:
        print(f"Disallowed address: {host}", file=sys.stderr)
        sys.exit(1)
    try:
        port = int(sys.argv[2])
        assert 1024 <= port <= 65535
    except (ValueError, AssertionError):
        print(f"Port must be an integer between 1024 and 65535", file=sys.stderr)
        sys.exit(1)
    return host, port


TARGET_HOST, TARGET_PORT = _parse_args()


async def relay(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle_client(local_reader, local_writer):
    try:
        remote_reader, remote_writer = await asyncio.wait_for(
            asyncio.open_connection(TARGET_HOST, TARGET_PORT), timeout=10
        )
    except Exception as e:
        local_writer.close()
        return

    await asyncio.gather(
        relay(local_reader, remote_writer),
        relay(remote_reader, local_writer),
        return_exceptions=True,
    )


async def main():
    server = await asyncio.start_server(handle_client, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    # Print port to stdout so Node.js parent knows where to connect
    print(port, flush=True)
    async with server:
        await server.serve_forever()


asyncio.run(main())
