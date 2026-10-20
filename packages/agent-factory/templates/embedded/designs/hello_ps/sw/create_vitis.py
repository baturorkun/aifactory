"""The Vitis Unified workspace of this design, made from its XSA.

    vitis -s designs/<design>/sw/create_vitis.py

The work is scripts/vitis_sw.py's, the template's: it makes the workspace
from the XSA the xsa stage wrote and the sources in sw/src, builds the
application and copies the ELF to out/<design>/artifacts. On Windows the
workspace is short and fixed, whatever the project and design are named
(RQ-0063). A design that needs more than that adds it here, around main().
"""

import os
import sys

SW_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SW_DIR, "..", "..", "..", "scripts"))

import vitis_sw  # noqa: E402

vitis_sw.main(SW_DIR)
