# IPv4 & IPv6 Addressing, Subnetting and Network Visualization Simulator
21ECC402P – Computer Communication and Network Security (CCNS)

## Run
```bash
pip install -r requirements.txt
streamlit run app.py
```
Keep `app.py` and `netcore.py` in the same folder. The browser opens automatically.

## Files
| File | Purpose |
|------|---------|
| `app.py` | Streamlit web interface (Sections 1-4 from the report) |
| `netcore.py` | All logic: validation, subnetting, binary view, topology, BFS routing, SVG animation |

## Sections
1. **IP Address Input** (sidebar) - IPv4/IPv6, address, CIDR prefix, number of subnets, devices per subnet
2. **Addressing & Subnetting** - network/mask/broadcast/range/counts, colour-coded binary view, 6-step calculation, subnet table
3. **Network Topology** - Internet -> Router -> Switches -> End devices with auto-assigned IPs and gateways
4. **Routing Simulation** - pick source and destination, animated packet, hop-by-hop explanation (ARP/NDP, routing table lookup, TTL)

Libraries: Python standard `ipaddress` + Streamlit only.
