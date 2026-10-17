# The gates a build passes through. Writing a report is not enough: a gate that
# fails stops the build with an error, which flow.tcl turns into exit 1.

# Setup and hold slack of the open, routed design. Both must be >= 0 ns; a
# hold slack of a few tens of ps is normal after hold fixing, the threshold
# is still 0. A design with no timed path (no clock constraint reaches a
# register) has nothing to fail, and says so.
proc gate_timing {} {
    set setup [get_timing_paths -quiet -max_paths 1 -setup]
    set hold [get_timing_paths -quiet -max_paths 1 -hold]
    if {[llength $setup] == 0 && [llength $hold] == 0} {
        puts "TIMING: no timed path in the design"
        return [list "" ""]
    }
    set wns [get_property SLACK $setup]
    set whs [get_property SLACK $hold]
    puts "TIMING: WNS $wns ns, WHS $whs ns"
    if {($wns ne "" && $wns < 0) || ($whs ne "" && $whs < 0)} {
        error "TIMING FAILED: WNS $wns ns, WHS $whs ns (both must be >= 0)"
    }
    return [list $wns $whs]
}

# DRC of the open design; any violation of severity Error fails.
proc gate_drc {report_file} {
    report_drc -name flow_drc -file $report_file
    set errors [get_drc_violations -quiet -name flow_drc -filter {SEVERITY == "Error"}]
    set count [llength $errors]
    puts "DRC: $count error(s)"
    if {$count > 0} {
        foreach violation [lrange $errors 0 9] {
            puts "  [get_property NAME $violation]: [get_property DESCRIPTION $violation]"
        }
        error "DRC FAILED: $count error(s), see $report_file"
    }
    return $count
}

# A self-checking testbench prints TEST PASSED when every check held and
# stops with severity failure when one did not. A log without TEST PASSED,
# or with a failure, fails.
proc gate_sim {name log_file {shown ""}} {
    if {$shown eq ""} { set shown $log_file }
    set fh [open $log_file r]
    set text [read $fh]
    close $fh
    set passed [regexp {TEST PASSED} $text]
    set failed [regexp -nocase {(^|\n)\s*(Failure|FATAL_ERROR|ERROR:)} $text]
    if {!$passed || $failed} {
        set tail [lrange [split [string trimright $text] "\n"] end-15 end]
        puts [join $tail "\n"]
        error "SIM FAILED: $name ([expr {$passed ? {a failure in the log} : {no TEST PASSED}}]), see $shown"
    }
    puts "SIM: $name TEST PASSED"
}
