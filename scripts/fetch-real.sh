#!/usr/bin/env bash
# Downloads the public, real-world Statements of Values used by
# scripts/real.ts and the Mississippi smoke test. These are government
# records published with insurance RFPs; they are fetched rather than
# committed so the repo stays small and the provenance stays obvious.
set -euo pipefail

dir="$(cd "$(dirname "$0")/.." && pwd)/fixtures/real"
mkdir -p "$dir"
ua="Mozilla/5.0 (sov-check fixture fetch)"

fetch() {
  local name="$1" url="$2"
  echo "-> $name"
  curl -sSL -A "$ua" --max-time 120 -o "$dir/$name" "$url"
}

# State of Mississippi, Department of Finance and Administration. 79 pages,
# 3,861 buildings, 49 department subtotals.
fetch mississippi.pdf "https://www.dfa.ms.gov/sites/default/files/State%20Property%20Insurance%20Home/EIS%20SOV%20Report%2009102026.pdf"

# Town of Ware, MA. RFQ 2024-01 Addendum 1; the SOV is Attachment A on page 2
# of a 150-page packet that also carries property cards and loss runs.
fetch ware-rfq.pdf "https://cms1files.revize.com/warema/2-Town%20of%20Ware%20RFQ%20Insurance%20Addendum%201%2003-05-2024.pdf"

# Atlanta Housing, RFP 2024-0115 Addendum 1. Not an SOV: a negative control
# that must produce zero rows rather than garbage.
fetch atlanta-housing.pdf "https://www.atlantahousing.org/wp-content/uploads/2024/04/RFP-2024-0115-Insurance-Broker-and-Related-Services-Addendum-1-Pckg-1.pdf"

echo "done: $dir"
