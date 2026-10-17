# Board files

Vivado board files the designs use (a `board_part` pattern in a design's
`project.tcl`). They are kept here, in the repository, so that every machine
and the CI find the same ones: the flow loads this directory with
`set_param board.repoPaths`. A board file copied only into one machine's Vivado
installation is missing on every other machine.

Put each board's directory here as its vendor ships it, for example
`zedboard/1.4/board.xml`. Without a matching board file the flow continues
with the part alone, and a block design falls back to the processor's own
preset where one exists.
