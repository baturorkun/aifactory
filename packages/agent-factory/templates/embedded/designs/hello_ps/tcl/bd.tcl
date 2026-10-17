# hello_ps block design: the processing system alone, its DDR and fixed I/O
# brought out, UART1 on MIO 48/49 from the ZedBoard preset.
#
# It only builds a design in the project that is open, so it can also be
# sourced from the Vivado GUI. A design that adds PL blocks keeps them here.

set design_name system
create_bd_design $design_name

set ps [create_bd_cell -type ip -vlnv xilinx.com:ip:processing_system7:* processing_system7_0]

# With the board files (common/boards) the project has a board part, and its
# preset has the DDR fitted on current boards. Without them,
# processing_system7's own ZedBoard preset is used. Either way DDR and
# FIXED_IO become top-level ports.
if {[get_property board_part [current_project]] ne ""} {
    apply_bd_automation -rule xilinx.com:bd_rule:processing_system7 \
        -config {make_external "FIXED_IO, DDR" apply_board_preset "1" Master "Disable" Slave "Disable"} $ps
} else {
    puts "WARNING: no board part, using the processing_system7 built-in ZedBoard preset."
    set_property CONFIG.preset {ZedBoard} $ps
    apply_bd_automation -rule xilinx.com:bd_rule:processing_system7 \
        -config {make_external "FIXED_IO, DDR" apply_board_preset "0" Master "Disable" Slave "Disable"} $ps
}

# Only the PS-PL ports the design uses are open. The preset opens M_AXI_GP0
# and the fabric clock and reset; left unconnected, validation fails.
set_property -dict [list \
    CONFIG.PCW_USE_M_AXI_GP0 {0} \
    CONFIG.PCW_EN_CLK0_PORT  {0} \
    CONFIG.PCW_EN_RST0_PORT  {0} \
] $ps

validate_bd_design
save_bd_design
