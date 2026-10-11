"""
IPv4 & IPv6 Addressing, Subnetting and Network Visualization Simulator
21ECC402P - Computer Communication and Network Security (CCNS)

Team: Aravind Sai K (RA2311053010035)
      Sainath Reddy E (RA2311053010038)
      Surya Teja D (RA2311053010040)

Run with:   streamlit run app.py
"""
import streamlit as st
import streamlit.components.v1 as components

import netcore as nc

st.set_page_config(page_title="IP Addressing & Network Simulator",
                   page_icon="🌐", layout="wide")

# --------------------------------------------------------------------------
# Header
# --------------------------------------------------------------------------
st.title("🌐 IPv4 & IPv6 Addressing, Subnetting and Network Visualization Simulator")
st.caption("21ECC402P – Computer Communication and Network Security (CCNS)")

# --------------------------------------------------------------------------
# SECTION 1 - IP ADDRESS INPUT (sidebar)
# --------------------------------------------------------------------------
with st.sidebar:
    st.header("Section 1 — IP Address Input")
    version = st.radio("IP version", ["IPv4", "IPv6"], horizontal=True)
    v4 = version == "IPv4"
    ip_text = st.text_input(
        "IP address",
        value="192.168.1.10" if v4 else "2001:db8:abcd::10",
        key=f"ip_{version}",
        help="Any host address inside the network, e.g. 192.168.1.10")
    prefix = st.number_input(
        "CIDR prefix length  (/n)", min_value=0, max_value=32 if v4 else 128,
        value=24 if v4 else 48, step=1, key=f"prefix_{version}")
    n_sub = st.select_slider("Number of subnets", options=[1, 2, 4, 8], value=4)
    devices = st.slider("End devices per subnet", 1, 4, 2)
    st.divider()
    st.caption("Team: Aravind Sai K · Sainath Reddy E · Surya Teja D")

# --------------------------------------------------------------------------
# Validation + processing
# --------------------------------------------------------------------------
try:
    iface = nc.parse_input(version, ip_text, prefix)
    topo = nc.build_topology(iface.network, n_sub, devices)
except nc.InputError as err:
    st.error(f"⚠️ {err}")
    st.stop()

net = iface.network
analysis = nc.analyze(iface)
sub_prefix = topo.new_prefix if n_sub > 1 else None

st.success(
    f"**Input accepted:** `{iface.ip}/{net.prefixlen}` is an **{version}** address "
    f"({nc.address_type(iface.ip)}).  Network: `{net}` → split into "
    f"**{n_sub} subnet(s)** of `/{topo.new_prefix}`.")
for note in topo.notes:
    st.warning(note)

tab2, tab3, tab4, tab5 = st.tabs([
    "📊 Section 2 · Addressing & Subnetting",
    "🗺️ Section 3 · Network Topology",
    "🚀 Section 4 · Routing Simulation",
    "📘 Quick Theory"])

# --------------------------------------------------------------------------
# SECTION 2 - ADDRESSING & SUBNETTING RESULTS
# --------------------------------------------------------------------------
with tab2:
    first, last = nc.first_last_usable(net)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Network address", str(net.network_address))
    c2.metric("Subnet mask" if v4 else "Prefix", str(net.netmask) if v4 else f"/{net.prefixlen}")
    host_bits = net.max_prefixlen - net.prefixlen
    c3.metric("Broadcast" if v4 else "Interface-ID bits",
              str(net.broadcast_address) if v4 else f"{host_bits} bits")
    c4.metric("Usable hosts", nc.fmt_count(nc.usable_count(net), host_bits)
              if host_bits <= 16 else f"≈ 2^{host_bits}")

    left, right = st.columns([1, 1.25])
    with left:
        st.subheader("Addressing details")
        st.dataframe(analysis.rows(), hide_index=True)
    with right:
        st.subheader("Binary representation")
        st.markdown(nc.legend_html(sub_prefix is not None), unsafe_allow_html=True)
        st.markdown(nc.binary_panel_html(iface, sub_prefix), unsafe_allow_html=True)

    st.subheader(f"Subnets created ({n_sub} × /{topo.new_prefix})")
    user_ip = iface.ip
    rows = nc.subnet_table(net, n_sub, user_ip)
    st.dataframe(rows, hide_index=True)

    st.subheader("Step-by-step calculation")
    for i, step in enumerate(nc.subnet_steps(iface, n_sub)):
        with st.expander(step["title"], expanded=(i < 3)):
            st.markdown(step["text"])
            if step["html"]:
                st.markdown(step["html"], unsafe_allow_html=True)
            if step["table"]:
                st.dataframe(step["table"], hide_index=True)

# --------------------------------------------------------------------------
# SECTION 3 - GRAPHICAL NETWORK TOPOLOGY
# --------------------------------------------------------------------------
with tab3:
    st.subheader("Internet → Router → Switches → End devices")
    st.caption("Each coloured zone is one subnet. IP addresses and gateways were "
               "assigned automatically from the subnet calculations.")
    html, height = nc.topology_html(topo)
    components.html(html, height=height, scrolling=True)

    col_a, col_b = st.columns([1.4, 1])
    with col_a:
        st.subheader("Device addressing table")
        st.dataframe(topo.device_rows(), hide_index=True)
    with col_b:
        st.subheader("Router routing table")
        st.dataframe(topo.routes, hide_index=True)
        st.caption("C = directly connected · S* = static default route to the ISP")

# --------------------------------------------------------------------------
# SECTION 4 - ROUTING SIMULATION
# --------------------------------------------------------------------------
with tab4:
    st.subheader("Select source and destination → watch the packet travel")
    pcs = [p.id for p in topo.pcs()]
    label = {p.id: f"{p.id}  ({p.ip})" for p in topo.pcs()}
    label["INET"] = f"Internet  ({nc.internet_target(topo.version)})"

    s1, s2 = st.columns(2)
    src = s1.selectbox("Source device", pcs, index=0, format_func=lambda k: label[k])
    dst_options = [p for p in pcs if p != src] + ["INET"]
    default_dst = len(dst_options) - 2 if len(dst_options) > 1 else 0
    dst = s2.selectbox("Destination", dst_options, index=default_dst,
                       format_func=lambda k: label[k])

    path = nc.find_path(topo, src, dst)
    steps = nc.explain_path(topo, path)
    ttl_name = "TTL" if topo.version == 4 else "Hop Limit"

    st.markdown("**Path:** " + "  →  ".join(f"`{n}`" for n in path)
                + f"  ·  **{len(path) - 1} hops**")
    html, height = nc.topology_html(topo, path, steps, animate=True)
    components.html(html, height=height, scrolling=True)

    st.subheader("Hop-by-hop routing information")
    st.dataframe(
        [{"Step": i + 1, "Device": topo.nodes[s["node"]].label,
          "What happens": s["title"], ttl_name: s["ttl"]}
         for i, s in enumerate(steps)], hide_index=True)

    with st.expander("Router routing table used for this packet"):
        st.dataframe(topo.routes, hide_index=True)

# --------------------------------------------------------------------------
# QUICK THEORY
# --------------------------------------------------------------------------
with tab5:
    st.markdown("""
**IPv4** uses 32-bit addresses written as four decimal octets (`192.168.1.10`).
**IPv6** uses 128-bit addresses written as eight hexadecimal groups (`2001:db8::1`).

**CIDR** writes an address with its prefix length: `192.168.1.10/24` means the first
24 bits are the *network* part and the remaining `32 − 24 = 8` bits identify the *host*.

**Subnetting** splits one network into smaller ones by *borrowing host bits*:
borrowing `k` bits gives `2^k` subnets, each with prefix `/(original + k)`.

**Network address** = IP AND mask · **Broadcast** (IPv4) = network with all host bits set to 1 ·
**Usable hosts** = `2^host-bits − 2` (IPv4).

**Router** – connects different networks and decrements TTL / Hop Limit ·
**Switch** – connects devices inside one network (Layer 2) ·
**Default gateway** – the router address a host uses to reach other networks.
""")
