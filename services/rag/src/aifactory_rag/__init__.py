__all__ = ["__version__"]

from aifactory_rag.build_info import current_version

# 0.<N>.0 from the highest completed requirement RQ-<N> (see build_info.py).
__version__ = current_version()[0]
