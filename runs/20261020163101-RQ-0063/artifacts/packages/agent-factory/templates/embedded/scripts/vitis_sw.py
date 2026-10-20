"""The Vitis Unified workspace of a design, made from its XSA.

    vitis -s designs/<design>/sw/create_vitis.py

Each design's create_vitis.py calls main() here with its own directory; the
workspace logic lives here, in the template, so `factory template update`
brings its fixes to every design.

The workspace is made from the XSA the xsa stage wrote and the sources in
sw/src. A workspace made from the same XSA is reused and only the application
rebuilt (the usual loop when only C changed); after a hardware build, which
writes a new XSA, it is recreated, since everything in it derives from the
XSA. The ELF is copied to out/<design>/artifacts and recorded in summary.json.

Where the workspace is (RQ-0063): on Windows, Vitis' gcc stops at 259
characters, and the BSP it builds writes paths 190 characters deep under the
workspace. So there the workspace is <the directory above the project>\\.v\\
<8 characters of the project and design's hash>, the platform is named
"platform", and the longest path is the same for every project and design:
about 195 characters under C:\\ab. Elsewhere it is out/<design>/vitis.

`vitis -s` exits 0 even when this script fails, so the previous ELF is removed
first and scripts/flow.mjs fails the stage when no ELF comes out.
vitis.dispose() runs at the end in every case: a vitis-server left behind
locks the workspace.
"""

import hashlib
import json
import os
import re
import shutil
import stat
import sys
import time

import vitis

PLATFORM_NAME = "platform"


def workspace_of(root, design, out):
    """The design's Vitis workspace: short and fixed on Windows, out/<design>/vitis elsewhere."""
    if os.name != "nt":
        return os.path.join(out, "vitis")
    key = os.path.normcase(os.path.join(os.path.abspath(root), design))
    return os.path.join(os.path.dirname(os.path.abspath(root)), ".v", hashlib.sha256(key.encode("utf-8")).hexdigest()[:8])


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def remove_tree(path):
    """rmtree that also removes the read-only files Vitis exports."""
    def make_writable(function, target, *_):
        os.chmod(target, stat.S_IWRITE)
        function(target)
    if sys.version_info >= (3, 12):
        shutil.rmtree(path, onexc=make_writable)
    else:
        shutil.rmtree(path, onerror=make_writable)


def main(sw_dir):
    sw_dir = os.path.abspath(sw_dir)
    design_dir = os.path.dirname(sw_dir)
    design = os.path.basename(design_dir)
    root = os.path.dirname(os.path.dirname(design_dir))
    out = os.path.join(root, "out", design)
    artifacts = os.path.join(out, "artifacts")
    workspace = workspace_of(root, design, out)
    sources = os.path.join(sw_dir, "src")

    def project_value(name):
        """One `set NAME value` of the design's project.tcl."""
        with open(os.path.join(design_dir, "project.tcl"), encoding="utf-8") as handle:
            match = re.search(r"^\s*set\s+" + name + r"\s+\"?([^\"\s#]+)", handle.read(), re.MULTILINE)
        return match.group(1) if match else ""

    def update_summary(fields, duration):
        path = os.path.join(artifacts, "summary.json")
        summary = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as handle:
                summary = json.load(handle)
        summary.setdefault("artifacts", {}).update(fields)
        summary.setdefault("durations", {})["sw"] = round(duration, 1)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(summary, handle, indent=2)

    def copy_compile_database(app_name, domain):
        """The application's compile database and the platform's BSP headers, into
        artifacts/sw, for the coding standard check on another machine (RQ-0053).
        scripts/flow.mjs rewrites the database to the project's own paths."""
        sw = os.path.join(artifacts, "sw")
        os.makedirs(sw, exist_ok=True)
        database = os.path.join(workspace, app_name, "build", "compile_commands.json")
        if os.path.isfile(database):
            shutil.copy2(database, os.path.join(sw, "compile_commands.vitis.json"))
        include = os.path.join(workspace, PLATFORM_NAME, "export", PLATFORM_NAME, "sw", domain, "include")
        target = os.path.join(sw, "bsp-include")
        if os.path.isdir(include):
            if os.path.isdir(target):
                remove_tree(target)
            shutil.copytree(include, target)

    started = time.time()
    top = project_value("TOP")
    cpu = project_value("CPU")
    if not top or not cpu:
        sys.exit("designs/{}/project.tcl must set TOP and CPU for the software stage".format(design))
    xsa = os.path.join(artifacts, top + ".xsa")
    if not os.path.isfile(xsa):
        sys.exit("SW FAILED: no {} (run the xsa stage first)".format(os.path.relpath(xsa, root)))

    app_name = design + "_app"
    elf_artifact = os.path.join(artifacts, app_name + ".elf")
    if os.path.exists(elf_artifact):
        os.remove(elf_artifact)
    domain = "standalone_" + cpu
    stamp = os.path.join(workspace, ".xsa.sha256")
    digest = sha256(xsa)
    print("SW: workspace {}".format(workspace))
    if os.path.isdir(workspace):
        made_from = open(stamp, encoding="utf-8").read().strip() if os.path.exists(stamp) else ""
        if made_from != digest:
            print("SW: the XSA changed, recreating the workspace")
            remove_tree(workspace)

    client = vitis.create_client()
    try:
        fresh = not os.path.isdir(os.path.join(workspace, app_name))
        os.makedirs(workspace, exist_ok=True)
        client.set_workspace(path=workspace)
        names = sorted(name for name in os.listdir(sources) if not name.startswith("."))
        if fresh:
            platform = client.create_platform_component(
                name=PLATFORM_NAME, hw_design=xsa, os="standalone", cpu=cpu, domain_name=domain)
            platform.build()
            xpfm = os.path.join(workspace, PLATFORM_NAME, "export", PLATFORM_NAME, PLATFORM_NAME + ".xpfm")
            app = client.create_app_component(
                name=app_name, platform=xpfm, domain=domain, template="empty_application")
            app.import_files(from_loc=sources, files=names, dest_dir_in_cmp="src")
            if "lscript.ld" in names:
                app.set_app_config(key="USER_LINKER_SCRIPT", values=["../src/lscript.ld"])
            with open(stamp, "w", encoding="utf-8") as handle:
                handle.write(digest)
        else:
            print("SW: reusing the workspace (same XSA)")
            app = client.get_component(name=app_name)
            app.import_files(from_loc=sources, files=names, dest_dir_in_cmp="src")
        # The previous build's ELF would survive a failed compile and pass
        # for this one's.
        elf = os.path.join(workspace, app_name, "build", app_name + ".elf")
        if os.path.exists(elf):
            os.remove(elf)
        app.build()
    finally:
        vitis.dispose()

    if not os.path.isfile(elf):
        sys.exit("SW FAILED: the application build produced no {}".format(elf))
    shutil.copy2(elf, elf_artifact)
    copy_compile_database(app_name, domain)
    update_summary({"elf": app_name + ".elf"}, time.time() - started)
    print("SW: {} built, out/{}/artifacts/{}.elf".format(app_name, design, app_name))
