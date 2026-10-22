# The stages of the Vivado flow, in project and non-project mode, and the
# summary every build leaves. flow.tcl is the entry; nothing here holds a path
# that is not computed from the repository root.

namespace eval flow {
    variable ROOT ""
    variable design ""
    variable dir ""
    variable out ""
    variable cfg {}
    variable opts {}
    variable summary {}
}

set ::flow::STAGES {sim synth impl bit xsa build all clean}

proc flow::main {root argv} {
    variable ROOT
    variable design
    variable dir
    variable out
    variable opts
    variable summary
    set ROOT $root
    source [file join $ROOT common tool_check.tcl]
    source [file join $ROOT common gates.tcl]

    if {[llength $argv] < 2} {
        error "usage: vivado -mode batch -source flow.tcl -tclargs <design> <stage> \[--expect-version v\] \[--git-sha sha\] \[--jobs n\] \[--threads n\] \[--ip-cache dir\] \[--inputs hash\]\n  stages: $::flow::STAGES"
    }
    set design [lindex $argv 0]
    set stage [lindex $argv 1]
    set opts [dict create --expect-version "" --git-sha "" --jobs 4 --threads "" --ip-cache "" --inputs ""]
    foreach {key value} [lrange $argv 2 end] {
        if {![dict exists $opts $key]} { error "unknown option $key" }
        dict set opts $key $value
    }
    if {[lsearch -exact $::flow::STAGES $stage] < 0} {
        error "unknown stage '$stage', choose one of: $::flow::STAGES"
    }
    set dir [file join $ROOT designs $design]
    if {![file exists [file join $dir project.tcl]]} {
        error "no design '$design': designs/$design/project.tcl is missing"
    }
    set out [file join $ROOT out $design]

    if {$stage eq "clean"} {
        # Only this design's output, never a source. The log of this very run
        # (out/<design>/vivado-clean.log) is open, and Windows refuses to
        # delete an open file: everything else goes.
        if {[file isdirectory $out]} {
            foreach entry [glob -nocomplain -directory $out *] {
                if {[file tail $entry] ne "vivado-clean.log"} { file delete -force $entry }
            }
        }
        puts "CLEAN: out/$design removed"
        return
    }

    load_config
    if {$stage eq "all"} {
        # A whole run starts without the previous one's artifacts and summary.
        file delete -force [file join $out artifacts] [file join $out summary.dict]
    }
    file mkdir [file join $out artifacts] [file join $out reports] [file join $out checkpoints]
    summary_load
    if {$stage eq "build"} {
        # A build starts without the previous build's outputs (a failed build
        # must not leave an older bitstream looking like its result), and keeps
        # what the sim stage recorded.
        foreach file [glob -nocomplain -directory [file join $out artifacts] *.bit *.xsa *.elf] { file delete -force $file }
        foreach key {wns_ns whs_ns lut ff bram dsp drc_errors artifacts} { dict unset summary $key }
        if {[dict exists $summary durations]} {
            set kept [dict create]
            if {[dict exists $summary durations sim]} { dict set kept sim [dict get $summary durations sim] }
            dict set summary durations $kept
        }
    }

    set expected [dict get $opts --expect-version]
    if {$expected eq ""} { set expected [board_value tool_version] }
    set version [tool_check $expected]
    dict set summary tool vivado
    dict set summary tool_version $version
    dict set summary design $design
    dict set summary mode [cfg MODE]
    dict set summary part [cfg PART]
    if {[dict get $opts --git-sha] ne ""} { dict set summary git_sha [dict get $opts --git-sha] }

    set threads [dict get $opts --threads]
    if {$threads ne ""} {
        # This session (non-project mode runs here); project-mode runs are
        # their own processes and take it from thread_hooks.
        set_param general.maxThreads $threads
        puts "FLOW: $threads thread(s) per Vivado run"
    }

    set project [expr {[cfg MODE] eq "project"}]
    switch -- $stage {
        sim   { timed sim run_sim }
        synth { if {$project} { timed synth project_synth } else { timed synth np_synth } }
        impl  { if {$project} { timed impl project_impl } else { timed impl np_impl } }
        bit   { if {$project} { timed bit project_bit } else { timed bit np_bit } }
        xsa   {
            if {!$project} { error "the xsa stage needs a project-mode design (MODE project); '$design' is non_project" }
            timed xsa project_xsa
        }
        build { run_build $project }
        all   { timed sim run_sim; run_build $project }
    }
    summary_write
    puts "FLOW: $design $stage done, see out/$design/artifacts/summary.json"
}

proc flow::run_build {project} {
    if {$project} {
        timed synth project_synth
        # One run to the bitstream: launching write_bitstream after a separate
        # implementation run implements the design a second time.
        timed impl_bit project_impl_bit
        timed xsa project_xsa
    } else {
        timed synth np_synth
        timed impl np_impl
        timed bit np_bit
    }
}

# ------------------------------------------------------------
# project.tcl and the board file
# ------------------------------------------------------------

proc flow::load_config {} {
    variable dir
    variable cfg
    namespace eval ::flow::project {}
    foreach name {PART BOARD BOARD_PART MODE TOP BD VITIS IPS} {
        catch {unset ::flow::project::$name}
    }
    namespace eval ::flow::project [list source [file join $dir project.tcl]]
    set cfg [dict create BOARD "" BOARD_PART "" BD "" VITIS "" IPS ""]
    foreach name {PART BOARD BOARD_PART MODE TOP BD VITIS IPS} {
        if {[info exists ::flow::project::$name]} {
            dict set cfg $name [set ::flow::project::$name]
        }
    }
    foreach name {PART MODE TOP} {
        if {![dict exists $cfg $name] || [dict get $cfg $name] eq ""} {
            error "designs/[file tail $dir]/project.tcl does not set $name"
        }
    }
    if {[lsearch -exact {project non_project} [dict get $cfg MODE]] < 0} {
        error "MODE must be project or non_project, not '[dict get $cfg MODE]'"
    }
    if {[dict get $cfg MODE] eq "project" && [dict get $cfg BD] eq "" && [llength [hdl_sources]] == 0} {
        error "a project-mode design needs a block design (BD) or HDL sources"
    }
}

proc flow::cfg {name} {
    variable cfg
    return [dict get $cfg $name]
}

# One top-level scalar of boards/<BOARD>.yaml (`key: value`).
proc flow::board_value {key} {
    variable ROOT
    set board [cfg BOARD]
    if {$board eq ""} { return "" }
    set file [file join $ROOT boards "$board.yaml"]
    if {![file exists $file]} { error "BOARD is '$board' but boards/$board.yaml does not exist" }
    set fh [open $file r]
    set text [read $fh]
    close $fh
    if {[regexp -line "^${key}:\\s*\"?(\[^\"#\\s\]+)" $text -> value]} { return $value }
    return ""
}

proc flow::files_in {subdir patterns} {
    variable dir
    set found {}
    set path [file join $dir $subdir]
    if {![file isdirectory $path]} { return {} }
    foreach pattern $patterns {
        foreach file [glob -nocomplain -types f -directory $path $pattern] {
            lappend found [file normalize $file]
        }
    }
    return [lsort -unique $found]
}

proc flow::hdl_sources {} { return [files_in src {*.vhd *.vhdl *.v *.sv}] }

# The HDL of the design's own IP (project.tcl `set IPS {name ...}`), for
# simulation: ip/<name>/hdl in the order of its files.f, else sorted.
proc flow::ip_sources {} {
    variable ROOT
    set found {}
    foreach ip [cfg IPS] {
        set hdl [file join $ROOT ip $ip hdl]
        if {![file isdirectory $hdl]} { error "IPS names '$ip' but ip/$ip/hdl does not exist" }
        set list [file join $hdl files.f]
        if {[file exists $list]} {
            set fh [open $list r]
            foreach line [split [read $fh] "\n"] {
                set line [string trim $line]
                if {$line ne "" && ![string match "#*" $line]} { lappend found [file normalize [file join $hdl $line]] }
            }
            close $fh
        } else {
            foreach file [lsort [glob -nocomplain -types f -directory $hdl *.vhd *.vhdl *.v *.sv]] {
                lappend found [file normalize $file]
            }
        }
    }
    return $found
}
proc flow::constraints {} { return [files_in constraints {*.xdc}] }

# ------------------------------------------------------------
# Timing of stages, utilisation, summary.json
# ------------------------------------------------------------

proc flow::timed {stage command} {
    variable summary
    puts ""
    puts "==== $stage ===="
    set start [clock milliseconds]
    $command
    set seconds [expr {([clock milliseconds] - $start) / 1000.0}]
    dict set summary durations $stage $seconds
    puts "==== $stage done in [format %.1f $seconds] s ===="
}

proc flow::record_utilization {} {
    variable summary
    set text [report_utilization -return_string]
    foreach {key pattern} {
        lut  {\|\s*(?:Slice|CLB) LUTs\*?\s*\|\s*([0-9.]+)}
        ff   {\|\s*(?:Slice|CLB) Registers\s*\|\s*([0-9.]+)}
        bram {\|\s*Block RAM Tile\s*\|\s*([0-9.]+)}
        dsp  {\|\s*DSPs\s*\|\s*([0-9.]+)}
    } {
        if {[regexp $pattern $text -> value]} { dict set summary $key $value }
    }
}

proc flow::record_gates {} {
    variable out
    variable summary
    lassign [gate_timing] wns whs
    dict set summary wns_ns $wns
    dict set summary whs_ns $whs
    dict set summary drc_errors [gate_drc [file join $out reports drc.rpt]]
}

# The summary persists as a Tcl dict between Vivado sessions, so a stage run
# on its own keeps what earlier stages recorded; summary.json is written from
# it. The software stage adds its own fields to summary.json.
proc flow::summary_load {} {
    variable out
    variable summary
    set file [file join $out summary.dict]
    set summary [dict create]
    if {[file exists $file]} {
        set fh [open $file r]
        set summary [read $fh]
        close $fh
    }
}

proc flow::json_string {value} {
    return "\"[string map {\\ \\\\ \" \\\" \n \\n \r \\r \t \\t} $value]\""
}

proc flow::json_scalar {value} {
    if {$value eq ""} { return null }
    if {[string is double -strict $value]} { return $value }
    return [json_string $value]
}

proc flow::summary_write {} {
    variable out
    variable summary
    set fh [open [file join $out summary.dict] w]
    puts -nonewline $fh $summary
    close $fh

    set fields {}
    foreach key {design mode part tool tool_version git_sha wns_ns whs_ns lut ff bram dsp drc_errors} {
        set value [expr {[dict exists $summary $key] ? [dict get $summary $key] : ""}]
        # Names and versions stay strings even when they look like numbers (2025.2).
        if {$value ne "" && $key in {design mode part tool tool_version git_sha}} {
            lappend fields "  [json_string $key]: [json_string $value]"
        } else {
            lappend fields "  [json_string $key]: [json_scalar $value]"
        }
    }
    foreach group {durations sim artifacts} {
        set inner {}
        if {[dict exists $summary $group]} {
            dict for {key value} [dict get $summary $group] {
                lappend inner "[json_string $key]: [json_scalar $value]"
            }
        }
        lappend fields "  [json_string $group]: \{[join $inner {, }]\}"
    }
    set fh [open [file join $out artifacts summary.json] w]
    puts $fh "\{\n[join $fields ",\n"]\n\}"
    close $fh
}

proc flow::copy_reports {} {
    variable out
    file mkdir [file join $out artifacts reports]
    foreach report [glob -nocomplain -directory [file join $out reports] *.rpt] {
        file copy -force $report [file join $out artifacts reports]
    }
}

# ------------------------------------------------------------
# Simulation: xvhdl / xvlog, xelab, xsim, one run per testbench
# ------------------------------------------------------------

proc flow::xilinx_tool {name} {
    set exe [file join $::env(XILINX_VIVADO) bin $name]
    if {$::tcl_platform(platform) eq "windows"} { append exe .bat }
    return $exe
}

# Runs a simulator tool in the simulation directory; its whole output goes to
# a log. Returns the exit status instead of raising, so the log can be shown.
proc flow::run_tool {simdir log name args} {
    set here [pwd]
    cd $simdir
    set status [catch {exec [xilinx_tool $name] {*}$args 2>@1} output options]
    cd $here
    set fh [open $log w]
    puts $fh $output
    close $fh
    return $status
}

proc flow::run_sim {} {
    variable dir
    variable out
    variable summary
    set benches [files_in tb {tb_*.vhd tb_*.vhdl tb_*.v tb_*.sv}]
    if {[llength $benches] == 0} {
        puts "SIM: no testbench (designs/[file tail $dir]/tb/tb_*)"
        return
    }
    set simdir [file join $out sim]
    file delete -force $simdir
    file mkdir $simdir

    set all [concat [ip_sources] [hdl_sources] [files_in tb {*.vhd *.vhdl *.v *.sv}]]
    set vhdl [lsearch -all -inline -regexp $all {\.vhdl?$}]
    set verilog [lsearch -all -inline -regexp $all {\.v$}]
    set sv [lsearch -all -inline -regexp $all {\.sv$}]
    if {[llength $verilog] > 0 && [run_tool $simdir [file join $simdir xvlog.log] xvlog {*}$verilog] != 0} {
        error "SIM FAILED: xvlog, see [file join $simdir xvlog.log]"
    }
    if {[llength $sv] > 0 && [run_tool $simdir [file join $simdir xvlog_sv.log] xvlog -sv {*}$sv] != 0} {
        error "SIM FAILED: xvlog -sv, see [file join $simdir xvlog_sv.log]"
    }
    if {[llength $vhdl] > 0 && [run_tool $simdir [file join $simdir xvhdl.log] xvhdl --2008 {*}$vhdl] != 0} {
        error "SIM FAILED: xvhdl, see [file join $simdir xvhdl.log]"
    }

    file mkdir [file join $out artifacts sim]
    foreach bench $benches {
        set name [file rootname [file tail $bench]]
        if {[run_tool $simdir [file join $simdir $name.elab.log] xelab $name -s $name -debug off] != 0} {
            error "SIM FAILED: xelab $name, see [file join $simdir $name.elab.log]"
        }
        set log [file join $simdir $name.log]
        run_tool $simdir $log xsim $name -R
        file copy -force $log [file join $out artifacts sim]
        gate_sim $name $log "out/[file tail $out]/artifacts/sim/$name.log"
        dict set summary sim $name passed
    }
}

# ------------------------------------------------------------
# Non-project mode: in memory, a checkpoint after every step
# ------------------------------------------------------------

proc flow::has_design {} {
    return [expr {![catch {current_design}]}]
}

proc flow::open_checkpoint_of {name stage} {
    variable out
    if {[has_design]} { return }
    set dcp [file join $out checkpoints $name.dcp]
    if {![file exists $dcp]} { error "no $name.dcp: run the $stage stage first" }
    open_checkpoint $dcp
}

proc flow::np_synth {} {
    variable out
    foreach file [hdl_sources] {
        switch -regexp -- $file {
            {\.vhdl?$} { read_vhdl -vhdl2008 $file }
            {\.sv$}    { read_verilog -sv $file }
            default    { read_verilog $file }
        }
    }
    foreach xdc [constraints] { read_xdc $xdc }
    synth_design -top [cfg TOP] -part [cfg PART]
    write_checkpoint -force [file join $out checkpoints post_synth.dcp]
    report_utilization -file [file join $out reports post_synth_util.rpt]
    report_timing_summary -file [file join $out reports post_synth_timing.rpt]
}

proc flow::np_impl {} {
    variable out
    open_checkpoint_of post_synth synth
    opt_design
    write_checkpoint -force [file join $out checkpoints post_opt.dcp]
    place_design
    write_checkpoint -force [file join $out checkpoints post_place.dcp]
    phys_opt_design
    write_checkpoint -force [file join $out checkpoints post_phys_opt.dcp]
    route_design
    write_checkpoint -force [file join $out checkpoints post_route.dcp]
    report_utilization -file [file join $out reports post_route_util.rpt]
    report_timing_summary -file [file join $out reports post_route_timing.rpt]
    record_utilization
    record_gates
    copy_reports
}

proc flow::np_bit {} {
    variable out
    variable summary
    open_checkpoint_of post_route impl
    set bit [file join $out artifacts "[cfg TOP].bit"]
    write_bitstream -force $bit
    dict set summary artifacts bit "[cfg TOP].bit"
}

# ------------------------------------------------------------
# Project mode: the project is output under out/<design>/project, made from
# project.tcl and the block design script; an existing one is opened, never
# deleted.
# ------------------------------------------------------------

proc flow::project_open {} {
    variable ROOT
    variable dir
    variable out
    variable design
    if {[catch {current_project}] == 0} { return }
    set project_dir [file join $out project]
    set xpr [file join $project_dir "$design.xpr"]
    # An existing project keeps the block design and the IP it was made with:
    # bd.tcl runs only into an empty project. When what made them changed
    # (project.tcl, the design's tcl/ and ip/, the project's ip/, the boards;
    # their hash is --inputs, RQ-0086) the project is made again, as a clean
    # would, so a build never carries an older block design or IP.
    set inputs [dict get $::flow::opts --inputs]
    set stamp [file join $out project.inputs]
    if {$inputs ne "" && [file exists $xpr]} {
        set before ""
        if {[file exists $stamp]} {
            set fh [open $stamp r]
            set before [string trim [read $fh]]
            close $fh
        }
        if {$before ne $inputs} {
            puts "PROJECT: the block design's or the IP's inputs changed; making $xpr again"
            file delete -force $project_dir
        }
    }
    if {[file exists $xpr]} {
        puts "PROJECT: opening $xpr"
        open_project $xpr
    } else {
        puts "PROJECT: creating $xpr"
        create_project $design $project_dir -part [cfg PART]
        set_property target_language VHDL [current_project]
    }
    if {[file isdirectory [file join $ROOT common boards]]} {
        set_param board.repoPaths [list [file join $ROOT common boards]]
    }
    if {[cfg BOARD_PART] ne "" && [get_property board_part [current_project]] eq ""} {
        set parts [get_board_parts -quiet -latest_file_version [cfg BOARD_PART]]
        if {[llength $parts] > 0} {
            set_property board_part [lindex $parts 0] [current_project]
            puts "PROJECT: board part [lindex $parts 0]"
        } else {
            puts "WARNING: no board part matches '[cfg BOARD_PART]', continuing with the part alone."
        }
    }

    foreach file [hdl_sources] {
        if {[llength [get_files -quiet $file]] == 0} {
            add_files -norecurse $file
            if {[regexp {\.vhdl?$} $file]} { set_property file_type {VHDL 2008} [get_files $file] }
        }
    }
    foreach xdc [constraints] {
        if {[llength [get_files -quiet $xdc]] == 0} { add_files -fileset constrs_1 -norecurse $xdc }
    }

    # The IP synthesized out of context is kept in one cache for every copy
    # on the build host (RQ-0080): a new branch's copy takes it from there
    # instead of synthesizing the block design's IP again.
    set cache [dict get $::flow::opts --ip-cache]
    if {$cache ne ""} {
        if {[file pathtype $cache] ne "absolute"} { set cache [file join $ROOT $cache] }
        file mkdir $cache
        config_ip_cache -use_cache_location [file normalize $cache]
        puts "PROJECT: IP cache [file normalize $cache]"
    }

    if {[cfg BD] ne ""} {
        if {[llength [get_files -quiet -all *.bd]] == 0} {
            # The block design script only builds a design in the open project.
            source [file join $dir [cfg BD]]
        }
        set bd [lindex [get_files -all *.bd] 0]
        if {$bd eq ""} { error "[cfg BD] made no block design" }
        set wrapper_name "[file rootname [file tail $bd]]_wrapper"
        if {[llength [get_files -quiet "$wrapper_name.*"]] == 0} {
            add_files -norecurse [make_wrapper -files $bd -top]
        }
        # Output products on their own: a failure here points at the IP, not
        # at "Launch of runs aborted".
        generate_target all $bd
        export_ip_user_files -of_objects $bd -no_script -sync -force -quiet
    }
    set_property top [cfg TOP] [current_fileset]
    update_compile_order -fileset sources_1
    thread_hooks
    # Every run synthesizes and implements in full (RQ-0086): an implementation
    # started from the copy's last routed result gave a bitstream whose
    # processor hung at its first PL access (embedded1 RQ-0009), and neither
    # incremental flow saved time on these designs. A project an earlier
    # template set it on is set back.
    foreach name {synth_1 impl_1} {
        set run [get_runs -quiet $name]
        if {$run eq ""} { continue }
        set properties [list_property $run]
        if {[lsearch -exact $properties AUTO_INCREMENTAL_CHECKPOINT] >= 0} { set_property AUTO_INCREMENTAL_CHECKPOINT 0 $run }
        if {[lsearch -exact $properties INCREMENTAL_CHECKPOINT] >= 0 && [get_property INCREMENTAL_CHECKPOINT $run] ne ""} {
            catch { set_property INCREMENTAL_CHECKPOINT "" $run }
        }
    }
    if {$inputs ne ""} {
        set fh [open $stamp w]
        puts $fh $inputs
        close $fh
    }
}

# A project-mode run is a Vivado process of its own and does not take this
# session's general.maxThreads (RQ-0079): a hook before synthesis and before
# implementation's first step sets it there. A hook the design set itself is
# left alone, with a warning.
proc flow::thread_hooks {} {
    variable out
    set threads [dict get $::flow::opts --threads]
    if {$threads eq ""} { return }
    set hook [file normalize [file join $out threads.tcl]]
    set fh [open $hook w]
    puts $fh "set_param general.maxThreads $threads"
    close $fh
    foreach {run step} {synth_1 SYNTH_DESIGN impl_1 INIT_DESIGN} {
        set handle [get_runs -quiet $run]
        if {$handle eq ""} { continue }
        set current [get_property STEPS.$step.TCL.PRE $handle]
        if {$current eq "" || [file tail $current] eq "threads.tcl"} {
            set_property STEPS.$step.TCL.PRE $hook $handle
        } else {
            puts "WARNING: $run has its own $step hook ($current): its thread count is Vivado's default."
        }
    }
}

proc flow::wait_run {run} {
    wait_on_run $run
    if {[get_property PROGRESS [get_runs $run]] ne "100%"} {
        set log [file join [get_property DIRECTORY [get_runs $run]] runme.log]
        if {[file exists $log]} {
            set fh [open $log r]
            set lines [split [read $fh] "\n"]
            close $fh
            puts [join [lrange $lines end-30 end] "\n"]
        }
        error "$run failed, see $log"
    }
}

proc flow::project_synth {} {
    project_open
    reset_run synth_1
    launch_runs synth_1 -jobs [dict get $::flow::opts --jobs]
    wait_run synth_1
}

proc flow::project_impl {} {
    variable out
    project_open
    if {[get_property PROGRESS [get_runs synth_1]] ne "100%"} { project_synth }
    reset_run impl_1
    launch_runs impl_1 -jobs [dict get $::flow::opts --jobs]
    wait_run impl_1
    open_run impl_1
    report_utilization -file [file join $out reports post_route_util.rpt]
    report_timing_summary -file [file join $out reports post_route_timing.rpt]
    record_utilization
    record_gates
    copy_reports
}

proc flow::project_impl_bit {} {
    variable out
    variable summary
    project_open
    if {[get_property PROGRESS [get_runs synth_1]] ne "100%"} { project_synth }
    reset_run impl_1
    launch_runs impl_1 -to_step write_bitstream -jobs [dict get $::flow::opts --jobs]
    wait_run impl_1
    open_run impl_1
    report_utilization -file [file join $out reports post_route_util.rpt]
    report_timing_summary -file [file join $out reports post_route_timing.rpt]
    record_utilization
    record_gates
    copy_reports
    # The bitstream is an artifact only once the gates passed.
    set bits [glob -nocomplain -directory [get_property DIRECTORY [get_runs impl_1]] *.bit]
    if {[llength $bits] == 0} { error "impl_1 wrote no bitstream" }
    file copy -force [lindex $bits 0] [file join $out artifacts "[cfg TOP].bit"]
    dict set summary artifacts bit "[cfg TOP].bit"
}

proc flow::project_bit {} {
    variable out
    variable summary
    project_open
    if {[get_property PROGRESS [get_runs impl_1]] ne "100%"} { project_impl }
    launch_runs impl_1 -to_step write_bitstream -jobs [dict get $::flow::opts --jobs]
    wait_run impl_1
    set bits [glob -nocomplain -directory [get_property DIRECTORY [get_runs impl_1]] *.bit]
    if {[llength $bits] == 0} { error "impl_1 wrote no bitstream" }
    file copy -force [lindex $bits 0] [file join $out artifacts "[cfg TOP].bit"]
    dict set summary artifacts bit "[cfg TOP].bit"
}

proc flow::project_xsa {} {
    variable out
    variable summary
    project_open
    if {[llength [glob -nocomplain -directory [get_property DIRECTORY [get_runs impl_1]] *.bit]] == 0} { project_bit }
    if {[catch {current_design}]} { open_run impl_1 }
    set xsa [file join $out artifacts "[cfg TOP].xsa"]
    write_hw_platform -fixed -include_bit -force -file $xsa
    dict set summary artifacts xsa "[cfg TOP].xsa"
}
