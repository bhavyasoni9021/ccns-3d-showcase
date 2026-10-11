"""
netcore.py - core logic for the IPv4 & IPv6 Addressing, Subnetting and
Network Visualization Simulator (21ECC402P - CCNS).

This module has NO Streamlit dependency, so every function can be tested on
its own.  app.py (the Streamlit UI) only calls the functions defined here.

Contents
    1. Input validation
    2. Addressing analysis (network, mask, range, counts, type, class)
    3. Binary visualisation helpers (HTML)
    4. Step-by-step subnetting explanation
    5. Topology generation (router, switches, PCs, IP assignment)
    6. Routing: BFS path finding + per-hop explanation
    7. SVG topology renderer with animated packet
"""
from __future__ import annotations

import ipaddress
import json
import math
from collections import deque
from dataclasses import dataclass, field
from html import escape
from itertools import islice

# --------------------------------------------------------------------------
# Colours shared by the binary view and legend
# --------------------------------------------------------------------------
NET_COLOR = "#2563eb"    # original network bits
SUB_COLOR = "#16a34a"    # bits borrowed for subnetting
HOST_COLOR = "#ea580c"   # host bits


class InputError(ValueError):
    """Raised when the user's input cannot be used."""


# ==========================================================================
# 1. INPUT VALIDATION
# ==========================================================================
def parse_input(version: str, ip_text: str, prefix) -> ipaddress._BaseV4:
    """Validate IP + prefix and return an ip_interface (address with prefix)."""
    ip_text = (ip_text or "").strip()
    if not ip_text:
        raise InputError("Please enter an IP address.")
    if "%" in ip_text or "/" in ip_text:
        raise InputError("Enter only the address here - the prefix length "
                         "goes in the separate CIDR box.")
    try:
        addr = ipaddress.ip_address(ip_text)
    except ValueError:
        raise InputError(f"'{ip_text}' is not a valid {version} address.")

    want = 4 if version == "IPv4" else 6
    if addr.version != want:
        raise InputError(f"'{ip_text}' is an IPv{addr.version} address, but "
                         f"{version} is selected.")

    max_prefix = 32 if want == 4 else 128
    try:
        prefix = int(prefix)
    except (TypeError, ValueError):
        raise InputError("The CIDR prefix must be a whole number.")
    if not 0 <= prefix <= max_prefix:
        raise InputError(f"For {version} the prefix must be between 0 and "
                         f"{max_prefix}.")
    return ipaddress.ip_interface(f"{addr}/{prefix}")


# ==========================================================================
# 2. ADDRESSING ANALYSIS
# ==========================================================================
_DOC_NETS = [ipaddress.ip_network(n) for n in
             ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24",
              "2001:db8::/32")]
_ULA = ipaddress.ip_network("fc00::/7")


def address_type(addr) -> str:
    """Human-readable category of an address."""
    if addr.is_unspecified:
        return "Unspecified"
    if addr.is_loopback:
        return "Loopback"
    if addr.is_link_local:
        return "Link-local"
    if addr.is_multicast:
        return "Multicast"
    if any(addr.version == n.version and addr in n for n in _DOC_NETS):
        return "Documentation / example range (not routable)"
    if addr.version == 6 and addr in _ULA:
        return "Unique local (private)"
    if addr.version == 4 and addr.is_private:
        return "Private (RFC 1918 / not routable on the Internet)"
    if addr.is_reserved:
        return "Reserved"
    if addr.is_global:
        return "Global / public"
    return "Special-purpose"


def ipv4_class(addr) -> str:
    first = int(addr) >> 24
    if first < 128:
        return "A (historical)"
    if first < 192:
        return "B (historical)"
    if first < 224:
        return "C (historical)"
    if first < 240:
        return "D (multicast)"
    return "E (reserved)"


def first_last_usable(net):
    """(first usable, last usable) addresses of a network."""
    if net.version == 4:
        if net.prefixlen == 32:
            return net.network_address, net.network_address
        if net.prefixlen == 31:
            return net.network_address, net.broadcast_address
        return net.network_address + 1, net.broadcast_address - 1
    # IPv6: no broadcast; the all-zeros address is the Subnet-Router anycast
    if net.prefixlen >= 127:
        return net.network_address, net.broadcast_address
    return net.network_address + 1, net.broadcast_address


def usable_count(net) -> int:
    total = net.num_addresses
    if net.version == 4:
        if net.prefixlen == 32:
            return 1
        if net.prefixlen == 31:
            return 2
        return total - 2
    return total if net.prefixlen >= 127 else total - 1


def fmt_count(n: int, host_bits: int) -> str:
    """Format big counts nicely: 2^64 = 18,446,744,073,709,551,616."""
    if host_bits > 16:
        return f"2^{host_bits} = {n:,}"
    return f"{n:,}"


@dataclass
class Analysis:
    iface: object
    network: object
    rows_data: list = field(default_factory=list)

    def rows(self):
        return [{"Property": k, "Value": v} for k, v in self.rows_data]


def analyze(iface) -> Analysis:
    net = iface.network
    ip = iface.ip
    v4 = net.version == 4
    host_bits = net.max_prefixlen - net.prefixlen
    first, last = first_last_usable(net)
    rows = [("IP version", f"IPv{net.version}"),
            ("Address", str(ip))]
    if not v4:
        rows.append(("Address (fully expanded)", ip.exploded))
    rows += [("Address type", address_type(ip))]
    if v4:
        rows.append(("Class", ipv4_class(ip)))
    rows += [
        ("CIDR notation", f"{ip}/{net.prefixlen}"),
        ("Prefix length", f"/{net.prefixlen}  ({net.prefixlen} network bits, "
                          f"{host_bits} host bits)"),
        ("Subnet mask" if v4 else "Prefix mask", str(net.netmask)),
    ]
    if v4:
        rows.append(("Wildcard mask", str(net.hostmask)))
    rows.append(("Network address", str(net.network_address)))
    if v4:
        rows.append(("Broadcast address", str(net.broadcast_address)))
    rows += [
        ("First usable host", str(first)),
        ("Last usable host" if v4 else "Last address", str(last)),
        ("Total addresses", fmt_count(net.num_addresses, host_bits)),
        ("Usable host addresses",
         fmt_count(usable_count(net), host_bits)),
    ]
    return Analysis(iface=iface, network=net, rows_data=rows)


def subnet_table(base_net, n_subnets: int, user_ip=None, limit: int = 16):
    """Rows describing the subnets obtained by splitting base_net."""
    bits = int(math.log2(n_subnets))
    new_prefix = base_net.prefixlen + bits
    subs = list(islice(base_net.subnets(new_prefix=new_prefix), limit))
    rows = []
    for i, s in enumerate(subs, 1):
        f, l = first_last_usable(s)
        row = {"#": i, "Subnet": str(s)}
        if s.version == 4:
            row["Mask"] = str(s.netmask)
        row["Network"] = str(s.network_address)
        row["First usable"] = str(f)
        row["Last usable"] = str(l)
        if s.version == 4:
            row["Broadcast"] = str(s.broadcast_address)
        row["Total"] = fmt_count(s.num_addresses,
                                 s.max_prefixlen - s.prefixlen)
        row["Usable"] = fmt_count(usable_count(s),
                                  s.max_prefixlen - s.prefixlen)
        row["Contains your IP"] = ("<-- yes" if user_ip is not None
                                   and user_ip in s else "")
        rows.append(row)
    return rows


# ==========================================================================
# 3. BINARY VISUALISATION (HTML)
# ==========================================================================
def to_bits(addr) -> str:
    width = 32 if addr.version == 4 else 128
    return format(int(addr), f"0{width}b")


def _cls_at(i, prefix, sub_prefix):
    if i < prefix:
        return "net"
    if sub_prefix is not None and i < sub_prefix:
        return "sub"
    return "host"


_STYLE = {
    "net": f"color:{NET_COLOR};font-weight:700",
    "sub": f"color:{SUB_COLOR};font-weight:700",
    "host": f"color:{HOST_COLOR};font-weight:700",
    "sep": "color:#94a3b8",
}


def _runs_html(tokens) -> str:
    """tokens = [(char, cls)] -> merged <span> runs."""
    out, cur_cls, buf = [], None, []
    for ch, cls in tokens:
        if cls != cur_cls and buf:
            out.append(f'<span style="{_STYLE[cur_cls]}">{escape("".join(buf))}</span>')
            buf = []
        cur_cls = cls
        buf.append(ch)
    if buf:
        out.append(f'<span style="{_STYLE[cur_cls]}">{escape("".join(buf))}</span>')
    return "".join(out)


def bits_html(addr, prefix, sub_prefix=None) -> str:
    """Colour-coded binary of an IPv4 address (dotted octets) or one IPv6
    address as 8 groups of 16 bits (separated by ':')."""
    bits = to_bits(addr)
    group = 8 if addr.version == 4 else 16
    sep = "." if addr.version == 4 else ":"
    tokens = []
    for i, b in enumerate(bits):
        if i and i % group == 0:
            tokens.append((sep, "sep"))
        tokens.append((b, _cls_at(i, prefix, sub_prefix)))
    return _runs_html(tokens)


def hextet_bits_html(addr, idx, prefix, sub_prefix=None) -> str:
    """16 bits of one IPv6 hextet, split in nibbles."""
    bits = to_bits(addr)[idx * 16:(idx + 1) * 16]
    tokens = []
    for j, b in enumerate(bits):
        if j and j % 4 == 0:
            tokens.append((" ", "sep"))
        tokens.append((b, _cls_at(idx * 16 + j, prefix, sub_prefix)))
    return _runs_html(tokens)


def legend_html(with_sub: bool) -> str:
    items = [(NET_COLOR, "network bits")]
    if with_sub:
        items.append((SUB_COLOR, "borrowed subnet bits"))
    items.append((HOST_COLOR, "host bits"))
    parts = [f'<span style="color:{c};font-weight:700">&#9632;</span> {t}'
             for c, t in items]
    return '<div style="margin:4px 0 10px 0">' + " &nbsp;&nbsp; ".join(parts) + "</div>"


_MONO = "font-family:ui-monospace,Menlo,Consolas,monospace;"


def binary_panel_html(iface, sub_prefix=None) -> str:
    """Binary representation panel used in Section 2."""
    net = iface.network
    p = net.prefixlen
    rows = []
    if net.version == 4:
        entries = [("IP address", iface.ip),
                   ("Subnet mask", net.netmask),
                   ("Network address", net.network_address),
                   ("Broadcast address", net.broadcast_address)]
        for label, a in entries:
            rows.append(
                f'<tr><td style="padding:3px 12px 3px 0;white-space:nowrap">{label}</td>'
                f'<td style="padding:3px 12px 3px 0;{_MONO}white-space:nowrap">{a}</td>'
                f'<td style="padding:3px 0;{_MONO}white-space:nowrap">'
                f'{bits_html(a, p, sub_prefix)}</td></tr>')
        return ('<table style="border-collapse:collapse"><tbody>'
                + "".join(rows) + "</tbody></table>")
    # IPv6: one row per hextet
    ip, nw = iface.ip, net.network_address
    head = ('<tr style="text-align:left"><th style="padding:3px 12px 3px 0">Hextet</th>'
            '<th style="padding:3px 12px 3px 0">IP (hex)</th>'
            '<th style="padding:3px 12px 3px 0">IP address (binary)</th>'
            '<th style="padding:3px 0">Network address (binary)</th></tr>')
    ex = ip.exploded.split(":")
    for i in range(8):
        rows.append(
            f'<tr><td style="padding:2px 12px 2px 0">{i + 1}</td>'
            f'<td style="padding:2px 12px 2px 0;{_MONO}">{ex[i]}</td>'
            f'<td style="padding:2px 12px 2px 0;{_MONO}white-space:nowrap">'
            f'{hextet_bits_html(ip, i, p, sub_prefix)}</td>'
            f'<td style="padding:2px 0;{_MONO}white-space:nowrap">'
            f'{hextet_bits_html(nw, i, p, sub_prefix)}</td></tr>')
    return ('<table style="border-collapse:collapse"><thead>' + head
            + "</thead><tbody>" + "".join(rows) + "</tbody></table>")


# ==========================================================================
# 4. STEP-BY-STEP SUBNETTING EXPLANATION
# ==========================================================================
def _line(label, html):
    return (f'<div style="{_MONO}white-space:nowrap;margin:2px 0">'
            f'<span style="display:inline-block;width:11em;color:#64748b">{label}</span>'
            f'{html}</div>')


def subnet_steps(iface, n_subnets: int) -> list:
    """Return a list of {title, text, html, table} describing every calculation."""
    net = iface.network
    ip = iface.ip
    p = net.prefixlen
    maxp = net.max_prefixlen
    hb = maxp - p
    v4 = net.version == 4
    bits = int(math.log2(n_subnets))
    sub_prefix = p + bits if bits else None
    steps = []

    # -- Step 1 : binary of the address
    if v4:
        octets = str(ip).split(".")
        conv = "  \n".join(
            f"`{o:>3}` = `{int(o):08b}`" for o in octets)
        steps.append({
            "title": "Step 1 - Convert the IP address to binary",
            "text": "Every octet (0-255) is written as 8 bits:\n\n" + conv,
            "html": _line("IP address", bits_html(ip, p)), "table": None})
    else:
        steps.append({
            "title": "Step 1 - Convert the IPv6 address to binary",
            "text": ("An IPv6 address has 8 groups (hextets) of 16 bits. "
                     f"Expanded form: `{ip.exploded}`.  Each hex digit is 4 bits."),
            "html": None, "table": None})

    # -- Step 2 : mask
    if v4:
        steps.append({
            "title": f"Step 2 - Build the subnet mask from /{p}",
            "text": (f"/{p} means **{p} one-bits** followed by **{hb} zero-bits** "
                     f"(32 - {p} = {hb}).  In decimal this mask is "
                     f"`{net.netmask}`."),
            "html": _line("Mask", bits_html(net.netmask, p)), "table": None})
    else:
        steps.append({
            "title": f"Step 2 - Build the prefix mask from /{p}",
            "text": (f"/{p} means **{p} one-bits** followed by **{hb} zero-bits** "
                     f"(128 - {p} = {hb}).  The mask is `{net.netmask}`."),
            "html": None, "table": None})

    # -- Step 3 : AND
    if v4:
        html = (_line("IP address", bits_html(ip, p))
                + _line("Subnet mask", bits_html(net.netmask, p))
                + '<div style="border-top:1px solid #94a3b8;margin:3px 0"></div>'
                + _line("IP AND mask", bits_html(net.network_address, p)))
        steps.append({
            "title": "Step 3 - Network address = IP address AND subnet mask",
            "text": (f"A bitwise AND keeps the network bits and clears the host "
                     f"bits.  Result: **{net.network_address}**"),
            "html": html, "table": None})
    else:
        mask_int = int(net.netmask)
        ex_ip = ip.exploded.split(":")
        ex_nw = net.network_address.exploded.split(":")
        tbl = []
        for i in range(8):
            m = (mask_int >> (112 - 16 * i)) & 0xFFFF
            tbl.append({"Hextet": i + 1, "IP": ex_ip[i], "Mask": f"{m:04x}",
                        "IP AND Mask": ex_nw[i]})
        steps.append({
            "title": "Step 3 - Network prefix = IP address AND prefix mask",
            "text": (f"AND is applied hextet by hextet.  Result: "
                     f"**{net.network_address}/{p}**"),
            "html": None, "table": tbl})

    # -- Step 4 : counts
    total = net.num_addresses
    if v4:
        usable = usable_count(net)
        if p <= 30:
            usable_txt = f"{total:,} - 2 (network + broadcast) = **{usable:,}**"
        else:
            usable_txt = f"**{usable:,}** (special case for /{p})"
        steps.append({
            "title": "Step 4 - Count the addresses",
            "text": (f"Host bits = 32 - {p} = **{hb}**  \n"
                     f"Total addresses = 2^{hb} = **{total:,}**  \n"
                     f"Usable hosts = {usable_txt}"),
            "html": None, "table": None})
    else:
        steps.append({
            "title": "Step 4 - Count the addresses",
            "text": (f"Host (interface-ID) bits = 128 - {p} = **{hb}**  \n"
                     f"Total addresses = 2^{hb} = **{total:,}**  \n"
                     "IPv6 has no broadcast address; the all-zeros address is "
                     "reserved as the Subnet-Router anycast."),
            "html": None, "table": None})

    # -- Step 5 : last / broadcast + range
    first, last = first_last_usable(net)
    if v4:
        steps.append({
            "title": "Step 5 - Broadcast address and host range",
            "text": ("Broadcast = network address with **all host bits set to 1** "
                     "(network OR wildcard mask).  "
                     f"Broadcast = **{net.broadcast_address}**  \n"
                     f"Usable range: **{first} - {last}**"),
            "html": _line("Broadcast", bits_html(net.broadcast_address, p)),
            "table": None})
    else:
        steps.append({
            "title": "Step 5 - Address range",
            "text": ("Last address = network prefix with **all host bits set to 1**.  \n"
                     f"Range: **{first} - {last}**"),
            "html": None, "table": None})

    # -- Step 6 : subnetting
    if bits == 0:
        steps.append({
            "title": "Step 6 - Subnetting",
            "text": "One subnet selected - the network is not divided.  Choose 2, "
                    "4 or 8 subnets in the sidebar to see the division.",
            "html": None, "table": None})
    else:
        new_hb = maxp - sub_prefix
        steps.append({
            "title": f"Step 6 - Divide /{p} into {n_subnets} subnets",
            "text": (f"Subnets needed = {n_subnets} -> borrow **{bits}** host bit(s) "
                     f"because 2^{bits} = {n_subnets}.  \n"
                     f"New prefix = {p} + {bits} = **/{sub_prefix}**  \n"
                     f"Addresses per subnet = 2^{new_hb} = "
                     f"**{2 ** new_hb:,}**  \n"
                     f"Network bits (blue) + borrowed bits (green) + "
                     f"host bits (orange):"),
            "html": _line("Network", bits_html(net.network_address, p, sub_prefix)),
            "table": None})
    return steps


# ==========================================================================
# 5. TOPOLOGY GENERATION
# ==========================================================================
@dataclass
class Node:
    id: str
    kind: str            # internet | router | switch | pc
    label: str
    ip: str = ""         # plain address, e.g. 192.168.1.2
    prefix: int = 0
    gateway: str = ""
    subnet: int = -1     # index of subnet (-1 for none)
    x: float = 0.0
    y: float = 0.0


@dataclass
class Topology:
    version: int
    base: object
    new_prefix: int
    nodes: dict
    links: list                      # (a, b) in canonical order
    subnets: list                    # dicts: net, gateway, switch, pcs, iface
    router_ifaces: list              # dicts: iface, ip, prefix, neighbor, desc
    routes: list                     # routing table rows
    wan: dict
    width: float = 0
    height: float = 0
    notes: list = field(default_factory=list)
    devices_per_subnet: int = 0

    def adjacency(self):
        adj = {k: [] for k in self.nodes}
        for a, b in self.links:
            adj[a].append(b)
            adj[b].append(a)
        return adj

    def pcs(self):
        return [n for n in self.nodes.values() if n.kind == "pc"]

    def device_rows(self):
        rows = []
        for ifc in self.router_ifaces:
            rows.append({"Device": "R1 (Router)", "Role": ifc["desc"],
                         "Interface": ifc["iface"],
                         "IP / prefix": f'{ifc["ip"]}/{ifc["prefix"]}',
                         "Default gateway": "-", "Subnet": ifc.get("subnet", "-")})
        for n in self.nodes.values():
            if n.kind == "switch":
                rows.append({"Device": n.label, "Role": "Layer-2 switch",
                             "Interface": "-", "IP / prefix": "no IP needed (Layer 2)",
                             "Default gateway": "-",
                             "Subnet": str(self.subnets[n.subnet]["net"])})
            elif n.kind == "pc":
                rows.append({"Device": n.label, "Role": "End device",
                             "Interface": "eth0",
                             "IP / prefix": f"{n.ip}/{n.prefix}",
                             "Default gateway": n.gateway,
                             "Subnet": str(self.subnets[n.subnet]["net"])})
        return rows


_WAN_V4 = ["203.0.113.0/30", "198.51.100.0/30", "192.0.2.0/30"]
_WAN_V6 = ["2001:db8:ffff::/64", "3fff:ffff::/64", "fd00:ffff::/64"]
COL_W = 235
TOP_PAD = 40


def build_topology(base_net, n_subnets: int, devices_per_subnet: int) -> Topology:
    """Split base_net into n_subnets and create router / switches / PCs."""
    if n_subnets < 1 or n_subnets & (n_subnets - 1):
        raise InputError("Number of subnets must be a power of two (1, 2, 4, 8).")
    bits = int(math.log2(n_subnets))
    new_prefix = base_net.prefixlen + bits
    v4 = base_net.version == 4
    limit = base_net.max_prefixlen - 2
    if new_prefix > limit:
        raise InputError(
            f"Splitting /{base_net.prefixlen} into {n_subnets} subnets gives /{new_prefix}, "
            f"which is too small to hold a gateway and a host (largest usable prefix is "
            f"/{limit}).  Use a shorter prefix or fewer subnets.")

    subs = list(base_net.subnets(new_prefix=new_prefix))
    notes = []
    nodes, links, subnet_info, ifaces, routes = {}, [], [], [], []

    # how many devices fit?
    probe = list(islice(subs[0].hosts(), devices_per_subnet + 1))
    devs = max(1, min(devices_per_subnet, len(probe) - 1))
    if devs < devices_per_subnet:
        notes.append(f"Each /{new_prefix} subnet can only hold {devs} end device(s) "
                     f"besides the gateway, so devices per subnet was reduced to {devs}.")

    # WAN link that does not overlap the user's network
    wan_net = None
    for cand in (_WAN_V4 if v4 else _WAN_V6):
        c = ipaddress.ip_network(cand)
        if not c.overlaps(base_net):
            wan_net = c
            break
    wan_hosts = list(islice(wan_net.hosts(), 2))
    wan_peer, wan_router = wan_hosts[0], wan_hosts[1]

    # layout numbers
    width = max(640, n_subnets * COL_W + 2 * TOP_PAD)
    cx_mid = width / 2
    y_inet, y_router, y_switch, y_pc0, pc_step = 62, 200, 340, 425, 78

    nodes["INET"] = Node("INET", "internet", "Internet", x=cx_mid, y=y_inet)
    nodes["R1"] = Node("R1", "router", "R1", x=cx_mid, y=y_router)
    links.append(("INET", "R1"))

    pc_no = 0
    for i, s in enumerate(subs):
        hosts = list(islice(s.hosts(), devs + 1))
        gw, dev_ips = hosts[0], hosts[1:]
        cx = TOP_PAD + i * COL_W + 34
        sw_id = f"SW{i + 1}"
        nodes[sw_id] = Node(sw_id, "switch", sw_id, subnet=i, x=cx, y=y_switch)
        links.append(("R1", sw_id))
        pcs = []
        for k, dip in enumerate(dev_ips):
            pc_no += 1
            pid = f"PC{pc_no}"
            nodes[pid] = Node(pid, "pc", pid, ip=str(dip), prefix=new_prefix,
                              gateway=str(gw), subnet=i,
                              x=cx + 44, y=y_pc0 + k * pc_step)
            links.append((sw_id, pid))
            pcs.append(pid)
        iface = f"Gi0/{i}"
        ifaces.append({"iface": iface, "ip": str(gw), "prefix": new_prefix,
                       "neighbor": sw_id, "desc": f"Gateway for subnet {i + 1}",
                       "subnet": str(s)})
        routes.append({"Code": "C", "Destination": str(s), "Next hop": "directly connected",
                       "Interface": iface})
        subnet_info.append({"net": s, "gateway": str(gw), "switch": sw_id,
                            "pcs": pcs, "iface": iface})

    wan_iface = f"Gi0/{n_subnets}"
    ifaces.append({"iface": wan_iface, "ip": str(wan_router), "prefix": wan_net.prefixlen,
                   "neighbor": "INET", "desc": "WAN link to ISP", "subnet": str(wan_net)})
    routes.append({"Code": "C", "Destination": str(wan_net), "Next hop": "directly connected",
                   "Interface": wan_iface})
    default_dst = "0.0.0.0/0" if v4 else "::/0"
    routes.append({"Code": "S*", "Destination": default_dst,
                   "Next hop": str(wan_peer), "Interface": wan_iface})

    height = y_pc0 + (devs - 1) * pc_step + 55
    return Topology(version=base_net.version, base=base_net, new_prefix=new_prefix,
                    nodes=nodes, links=links, subnets=subnet_info,
                    router_ifaces=ifaces, routes=routes,
                    wan={"net": wan_net, "peer": str(wan_peer),
                         "router": str(wan_router), "iface": wan_iface},
                    width=width, height=height, notes=notes,
                    devices_per_subnet=devs)


# ==========================================================================
# 6. ROUTING - path finding and explanation
# ==========================================================================
def find_path(topo: Topology, src: str, dst: str):
    """Breadth-first search over the topology graph -> list of node ids."""
    if src not in topo.nodes or dst not in topo.nodes:
        raise InputError("Unknown source or destination device.")
    adj = topo.adjacency()
    prev = {src: None}
    q = deque([src])
    while q:
        cur = q.popleft()
        if cur == dst:
            break
        for nb in adj[cur]:
            if nb not in prev:
                prev[nb] = cur
                q.append(nb)
    if dst not in prev:
        raise InputError("No path found between the selected devices.")
    path, cur = [], dst
    while cur is not None:
        path.append(cur)
        cur = prev[cur]
    return path[::-1]


def internet_target(version: int) -> str:
    return "8.8.8.8" if version == 4 else "2001:4860:4860::8888"


def _mask_txt(topo, prefix):
    if topo.version == 4:
        return str(ipaddress.ip_network(f"0.0.0.0/{prefix}").netmask)
    return f"/{prefix}"


def explain_path(topo: Topology, path: list, ttl_start: int = 64) -> list:
    """One explanation dict per node on the path."""
    v4 = topo.version == 4
    ttl_name = "TTL" if v4 else "Hop Limit"
    resolver = "ARP" if v4 else "NDP (Neighbor Discovery)"
    src = topo.nodes[path[0]]
    dst = topo.nodes[path[-1]]
    dst_ip = dst.ip if dst.kind == "pc" else internet_target(topo.version)
    src_net = ipaddress.ip_network(f"{src.ip}/{src.prefix}", strict=False)
    same_net = dst.kind == "pc" and dst.ip and ipaddress.ip_address(dst.ip) in src_net
    iface_of = {i["neighbor"]: i for i in topo.router_ifaces}
    ttl = ttl_start
    steps = []

    for idx, nid in enumerate(path):
        n = topo.nodes[nid]
        prev_id = path[idx - 1] if idx else None
        next_id = path[idx + 1] if idx + 1 < len(path) else None

        if idx == 0:
            if same_net:
                title = "Source host: destination is on the SAME network"
                detail = (f"{src.ip} and {dst_ip} both fall in {src_net} "
                          f"(IP AND mask {_mask_txt(topo, src.prefix)} gives the same network). "
                          f"No router is needed - the host uses {resolver} to find "
                          f"{dst_ip}'s MAC address and sends the frame directly. "
                          f"Packet: {src.ip} -> {dst_ip}, {ttl_name} {ttl}.")
            else:
                if dst.kind == "pc":
                    dst_net = ipaddress.ip_network(f"{dst.ip}/{dst.prefix}", strict=False)
                    cmp_txt = (f"{dst_ip} belongs to {dst_net}, which is a different network")
                else:
                    cmp_txt = f"{dst_ip} is outside every local subnet"
                title = "Source host: destination is on a DIFFERENT network"
                detail = (f"{src.ip} AND mask {_mask_txt(topo, src.prefix)} = {src_net}; "
                          f"{cmp_txt}. The host therefore sends the packet to its default "
                          f"gateway {src.gateway} (R1). {resolver} resolves the gateway's MAC "
                          f"address. Packet: {src.ip} -> {dst_ip}, {ttl_name} {ttl}.")
        elif n.kind == "switch":
            title = f"{n.label}: Layer-2 forwarding"
            detail = (f"The switch looks up the destination MAC address in its MAC table and "
                      f"forwards the frame out of the matching port. Switches do not read IP "
                      f"headers, so the {ttl_name} stays {ttl}.")
        elif n.kind == "router":
            ingress = iface_of[prev_id]["iface"]
            egress_if = iface_of[next_id]
            ttl -= 1
            if dst.kind == "internet":
                route = (f"default route {topo.routes[-1]['Destination']} via "
                         f"{topo.routes[-1]['Next hop']}")
            else:
                route = (f"connected route {topo.subnets[dst.subnet]['net']} "
                         f"({egress_if['iface']})")
            title = "R1: routing decision"
            detail = (f"Packet arrives on {ingress}. The router strips the Layer-2 header, "
                      f"reads destination {dst_ip} and performs a longest-prefix-match lookup "
                      f"in its routing table -> {route}. It decrements the {ttl_name} "
                      f"({ttl + 1} -> {ttl}), builds a new Layer-2 frame (using {resolver} for "
                      f"the next hop) and sends it out of {egress_if['iface']}.")
        elif n.kind == "internet":
            title = "Internet: packet leaves the local network"
            detail = (f"The ISP receives the packet on the WAN link. From here it keeps being "
                      f"routed hop by hop towards {dst_ip}. {ttl_name} on arrival: {ttl}.")
        else:  # destination pc
            title = f"{n.label}: packet delivered"
            detail = (f"Destination MAC and IP ({dst.ip}) match, so the host accepts the packet "
                      f"and passes it to the upper layers (e.g. an ICMP echo request). "
                      f"{ttl_name} on arrival: {ttl}.")
        steps.append({"node": nid, "title": title, "detail": detail, "ttl": ttl})
    return steps


# ==========================================================================
# 7. SVG TOPOLOGY RENDERER (+ animated packet)
# ==========================================================================
SUBNET_FILL = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3",
               "#e0e7ff", "#ccfbf1", "#fee2e2", "#ede9fe"]
SUBNET_STROKE = ["#3b82f6", "#22c55e", "#f59e0b", "#ec4899",
                 "#6366f1", "#14b8a6", "#ef4444", "#8b5cf6"]
_FONT = "font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;"


def _link_points(topo: Topology, a: str, b: str):
    """Waypoints for the link a->b (either direction)."""
    na, nb = topo.nodes[a], topo.nodes[b]
    kinds = (na.kind, nb.kind)

    def canonical(p, q):
        if (p.kind, q.kind) == ("internet", "router"):
            return [(p.x, p.y), (q.x, q.y)]
        if (p.kind, q.kind) == ("router", "switch"):
            ymid = p.y + 62
            return [(p.x, p.y), (p.x, ymid), (q.x, ymid), (q.x, q.y)]
        if (p.kind, q.kind) == ("switch", "pc"):
            return [(p.x, p.y), (p.x, q.y), (q.x, q.y)]
        raise ValueError(kinds)

    order = {"internet": 0, "router": 1, "switch": 2, "pc": 3}
    if order[na.kind] < order[nb.kind]:
        return canonical(na, nb)
    return canonical(nb, na)[::-1]


def _pts(points):
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def _icon(node: Node, topo: Topology) -> str:
    x, y = node.x, node.y
    nid = node.id
    if node.kind == "internet":
        shapes = ('<ellipse cx="0" cy="10" rx="46" ry="17"/>'
                  '<circle cx="-22" cy="0" r="16"/><circle cx="2" cy="-10" r="21"/>'
                  '<circle cx="26" cy="2" r="15"/>')
        inner = shapes
        body = (f'<g fill="#e2e8f0" stroke="#64748b" stroke-width="2.5">{shapes}</g>'
                f'<g fill="#e2e8f0" stroke="none">{inner}</g>'
                f'<text x="0" y="8" text-anchor="middle" font-size="14" font-weight="700" '
                f'fill="#334155" style="{_FONT}">Internet</text>')
        ring_r = 56
    elif node.kind == "router":
        body = ('<circle r="27" fill="#2563eb" stroke="#1e3a8a" stroke-width="2.5"/>'
                '<g stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none">'
                '<line x1="-15" y1="0" x2="15" y2="0" marker-start="url(#ah)" marker-end="url(#ah)"/>'
                '<line x1="0" y1="-15" x2="0" y2="15" marker-start="url(#ah)" marker-end="url(#ah)"/></g>')
        ring_r = 36
    elif node.kind == "switch":
        body = ('<rect x="-30" y="-17" width="60" height="34" rx="7" fill="#0f766e" '
                'stroke="#134e4a" stroke-width="2.5"/>'
                '<g stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none">'
                '<line x1="-18" y1="-5" x2="18" y2="-5" marker-end="url(#ah)"/>'
                '<line x1="18" y1="6" x2="-18" y2="6" marker-end="url(#ah)"/></g>')
        ring_r = 38
    else:  # pc
        body = ('<rect x="-19" y="-17" width="38" height="25" rx="3" fill="#1e293b" '
                'stroke="#0f172a" stroke-width="2"/>'
                '<rect x="-15" y="-13" width="30" height="17" rx="1.5" fill="#38bdf8"/>'
                '<rect x="-5" y="8" width="10" height="5" fill="#475569"/>'
                '<rect x="-13" y="13" width="26" height="3.5" rx="1.5" fill="#475569"/>')
        ring_r = 28
    ring = (f'<circle class="ring" r="{ring_r}" fill="none" stroke="#ef4444" '
            f'stroke-width="3.5" opacity="0"/>')
    return (f'<g id="n-{nid}" class="node" transform="translate({x:.1f},{y:.1f})">'
            f'{ring}{body}</g>')


def _labels(node: Node, topo: Topology) -> str:
    x, y = node.x, node.y
    t = lambda s, dx, dy, size, weight, fill, mono=False: (
        f'<text x="{x + dx:.1f}" y="{y + dy:.1f}" font-size="{size}" font-weight="{weight}" '
        f'fill="{fill}" style="{_MONO if mono else _FONT}">{escape(s)}</text>')
    if node.kind == "internet":
        return (t(f"ISP {topo.wan['peer']}", 56, 6, 11, 500, "#475569", True))
    if node.kind == "router":
        return (t("R1", 40, -4, 14, 700, "#1e3a8a")
                + t("Router", 40, 11, 11, 400, "#475569"))
    if node.kind == "switch":
        net = topo.subnets[node.subnet]["net"]
        size = 10 if len(str(net)) > 18 else 11
        return (t(node.label, 38, -3, 13, 700, "#134e4a")
                + t(str(net), 38, 12, size, 500, "#334155", True))
    return (t(node.label, 28, -3, 13, 700, "#0f172a")
            + t(node.ip, 28, 12, 11, 500, "#334155", True))


def topology_html(topo: Topology, path=None, steps=None, animate=False):
    """Return (html, height_px).  With animate=True and a path, a red packet
    travels hop by hop and a caption explains every hop."""
    W, H = topo.width, topo.height
    path = path or []
    on_path = set(path)
    parts = []
    parts.append(
        f'<svg id="topo" xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" '
        f'viewBox="0 0 {W:.0f} {H:.0f}" style="background:#fff;border:1px solid #e2e8f0;'
        f'border-radius:10px;display:block">'
        '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" '
        'markerHeight="4.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" '
        'fill="#fff"/></marker></defs>')

    # subnet zones
    zone_top = 300
    for i, s in enumerate(topo.subnets):
        x0 = TOP_PAD + i * COL_W - 6
        fill, stroke = SUBNET_FILL[i % 8], SUBNET_STROKE[i % 8]
        parts.append(
            f'<rect x="{x0:.0f}" y="{zone_top}" width="{COL_W - 14}" height="{H - zone_top - 10:.0f}" '
            f'rx="14" fill="{fill}" stroke="{stroke}" stroke-width="1.5" stroke-dasharray="6 4" '
            f'opacity=".85"/>'
            f'<text x="{x0 + COL_W - 14 - 12:.0f}" y="{zone_top + 18}" font-size="12" font-weight="700" '
            f'text-anchor="end" fill="{stroke}" style="{_FONT}">Subnet {i + 1}</text>')

    # links
    link_color = "#94a3b8"
    for a, b in topo.links:
        pts = _link_points(topo, a, b)
        hot = a in on_path and b in on_path and abs(path.index(a) - path.index(b)) == 1
        stroke = "#fca5a5" if hot else link_color
        width = 6 if hot else 2.5
        lop = ' opacity=".3"' if (animate and path and not hot) else ""
        parts.append(f'<polyline points="{_pts(pts)}" fill="none" stroke="{stroke}" '
                     f'stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"{lop}/>')

    # WAN + gateway annotations
    inet, rt = topo.nodes["INET"], topo.nodes["R1"]
    parts.append(
        f'<text x="{rt.x + 10:.0f}" y="{(inet.y + rt.y) / 2 + 4:.0f}" font-size="11" '
        f'fill="#475569" style="{_MONO}">{topo.wan["iface"]} {topo.wan["router"]}/{topo.wan["net"].prefixlen}</text>')
    for i, s in enumerate(topo.subnets):
        sw = topo.nodes[s["switch"]]
        parts.append(
            f'<text x="{sw.x + 8:.0f}" y="{zone_top - 8}" font-size="10.5" fill="#475569" '
            f'style="{_MONO}">{s["iface"]} gw {s["gateway"]}</text>')

    # nodes + labels
    for n in topo.nodes.values():
        dim = animate and path and n.id not in on_path
        op = ' opacity=".4"' if dim else ""
        parts.append(f'<g{op}>{_icon(n, topo)}{_labels(n, topo)}</g>')

    # packet
    if animate and path:
        parts.append('<g id="pkt" opacity="0"><circle r="13" fill="#ef4444" opacity=".25"/>'
                     '<circle r="7" fill="#ef4444" stroke="#fff" stroke-width="2"/></g>')
    parts.append("</svg>")
    svg = "".join(parts)

    if not (animate and path and steps):
        html = (f'<div style="overflow-x:auto;padding:2px">{svg}</div>')
        return html, int(H + 24)

    hops = []
    for a, b in zip(path, path[1:]):
        hops.append([[round(x, 1), round(y, 1)] for x, y in _link_points(topo, a, b)])
    payload = json.dumps({"path": path, "hops": hops, "steps": steps}).replace("</", "<\\/")

    cap_h = 150
    html = f"""
<div style="{_FONT}">
  <div id="cap" style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;
       margin-bottom:8px;background:#f8fafc;height:{cap_h - 22}px;overflow:auto;color:#0f172a">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div><span id="badge" style="background:#ef4444;color:#fff;border-radius:999px;
           padding:2px 10px;font-size:12px;font-weight:700">Step 1</span>
           <b id="ttl" style="margin-left:8px;font-size:14px"></b></div>
      <div><span id="ttlv" style="background:#e2e8f0;border-radius:6px;padding:2px 8px;
           font-size:12px;{_MONO}"></span>
      <button onclick="play()" style="margin-left:8px;cursor:pointer;border:1px solid #cbd5e1;
           background:#fff;border-radius:6px;padding:3px 10px;font-size:12px">&#8635; Replay</button></div>
    </div>
    <div id="det" style="margin-top:6px;font-size:13px;line-height:1.45;color:#334155"></div>
  </div>
  <div style="overflow-x:auto;padding:2px">{svg}</div>
</div>
<script>
const D = {payload};
const pkt = document.getElementById('pkt');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let token = 0;
function setStep(i) {{
  document.querySelectorAll('.ring').forEach(r => r.setAttribute('opacity', 0));
  const g = document.getElementById('n-' + D.path[i]);
  if (g) g.querySelector('.ring').setAttribute('opacity', 1);
  const s = D.steps[i];
  document.getElementById('badge').textContent = 'Step ' + (i + 1) + ' / ' + D.steps.length;
  document.getElementById('ttl').textContent = s.title;
  document.getElementById('det').textContent = s.detail;
  document.getElementById('ttlv').textContent = '{("TTL" if topo.version == 4 else "Hop Limit")} = ' + s.ttl;
}}
function place(p) {{ pkt.setAttribute('transform', 'translate(' + p[0] + ',' + p[1] + ')'); }}
function move(pts, my) {{
  return new Promise(res => {{
    const seg = [], total = pts.slice(1).reduce((acc, p, i) => {{
      const l = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]); seg.push(l); return acc + l; }}, 0);
    const dur = Math.max(800, total / 0.22);
    const t0 = performance.now();
    function frame(t) {{
      if (my !== token) return res();
      const k = Math.min(1, (t - t0) / dur);
      let d = k * total, i = 0;
      while (i < seg.length - 1 && d > seg[i]) {{ d -= seg[i]; i++; }}
      const f = seg[i] ? Math.min(1, d / seg[i]) : 1;
      place([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]);
      if (k < 1) requestAnimationFrame(frame); else res();
    }}
    requestAnimationFrame(frame);
  }});
}}
async function play() {{
  const my = ++token;
  const start = D.hops[0][0];
  place(start); pkt.setAttribute('opacity', 1);
  setStep(0);
  await sleep(1200);
  for (let h = 0; h < D.hops.length; h++) {{
    if (my !== token) return;
    await move(D.hops[h], my);
    if (my !== token) return;
    setStep(h + 1);
    await sleep(1600);
  }}
}}
play();
</script>
"""
    return html, int(H + cap_h + 30)
