# hello_ps: the Zynq-7000 processing system with a UART "hello" application.
# Project mode, because a block design with a processor is built there; the
# project under out/hello_ps/project is output, made from this file and
# tcl/bd.tcl, never committed.
set BOARD      zedboard
set PART       xc7z020clg484-1
set BOARD_PART "*:zedboard:*"
set MODE       project
set TOP        system_wrapper
set BD         tcl/bd.tcl
set VITIS      unified
set CPU        ps7_cortexa9_0
# A design that uses the project's own IP names it: `set IPS {<ip> ...}`;
# simulation then compiles ip/<ip>/hdl (in the order of its files.f) first.
