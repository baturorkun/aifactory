/* Cortex-M3 probe layout, as verified on the SmartFusion2 M2S090 (BFI Eval 1):
 * the image sits at the start of the code window (eNVM mirrored at 0, or the
 * eSRAM address a debugger loads it to, with VTOR pointing there) and runs
 * its data and stack in eSRAM at 0x20000000. Adjust ORIGIN and LENGTH to
 * where this board boots the probe from. */
MEMORY
{
    FLASH (rx)  : ORIGIN = 0x00000000, LENGTH = 64K
    RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 16K
}

ENTRY(reset_handler)

SECTIONS
{
    .text : {
        KEEP(*(.vectors))
        *(.text*)
        *(.rodata*)
    } > FLASH

    .data : {
        . = ALIGN(4);
        __data_start__ = .;
        *(.data*)
        . = ALIGN(4);
        __data_end__ = .;
    } > RAM AT > FLASH
    __data_load__ = LOADADDR(.data);

    .bss : {
        . = ALIGN(4);
        __bss_start__ = .;
        *(.bss*)
        *(COMMON)
        . = ALIGN(4);
        __bss_end__ = .;
    } > RAM

    __stack_top__ = ORIGIN(RAM) + LENGTH(RAM);
}
