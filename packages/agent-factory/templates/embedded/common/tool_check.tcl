# The Vivado version the design's board file names (tool_version), or an error
# before anything runs: another version upgrades IP and gives other results.

proc tool_check {expected} {
    set actual [version -short]
    if {$expected eq ""} {
        error "TOOL VERSION: no expected version. Set tool_version in the board file the design's project.tcl names."
    }
    # 2025.2 accepts 2025.2 and its updates (2025.2.1), nothing else.
    if {$actual ne $expected && ![string match "${expected}.*" $actual]} {
        error "TOOL VERSION: this is Vivado $actual, the board file expects $expected."
    }
    puts "TOOL: Vivado $actual"
    return $actual
}
