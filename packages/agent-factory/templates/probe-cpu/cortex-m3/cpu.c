#include "probe.h"

/* Cortex-M3 startup, vectors and fault handling for the probe runtime.
 * Verified on the Microchip SmartFusion2 M2S090 (BFI Eval 1, aselsan-bfi
 * RQ-0009..RQ-0012): the probe boots from the vector table at the start of
 * the image, with VTOR at the code window or set to the table's address by
 * the debugger that loaded it (probe.json "vectorTable").
 *
 * Nothing here reads a peripheral before probe_run(): the leading reads of a
 * probe must see the state the hardware woke in. */

extern uint32_t __stack_top__;
extern uint32_t __bss_start__, __bss_end__;
extern uint32_t __data_load__, __data_start__, __data_end__;
void reset_handler(void);
void probe_fault_handler(void);

/* Every fault lands in the runtime's handler, so a bus fault inside a MEM
 * step is reported as that step's outcome instead of ending the probe. */
__attribute__((section(".vectors"), used))
const uintptr_t vector_table[16] = {
    (uintptr_t)&__stack_top__,
    (uintptr_t)reset_handler,
    (uintptr_t)probe_fault_handler, /* NMI */
    (uintptr_t)probe_fault_handler, /* HardFault */
    (uintptr_t)probe_fault_handler, /* MemManage */
    (uintptr_t)probe_fault_handler, /* BusFault */
    (uintptr_t)probe_fault_handler, /* UsageFault */
    0, 0, 0, 0,
    (uintptr_t)probe_fault_handler, /* SVCall */
    0, 0,
    (uintptr_t)probe_fault_handler, /* PendSV */
    (uintptr_t)probe_fault_handler, /* SysTick */
};

void reset_handler(void)
{
    /* Nothing below reads a peripheral; the C runtime is set up first. */
    for (uint32_t *src = &__data_load__, *dst = &__data_start__; dst < &__data_end__; ) *dst++ = *src++;
    for (uint32_t *dst = &__bss_start__; dst < &__bss_end__; ) *dst++ = 0u;

    probe_run();
    probe_cpu_idle();
}

/* CFSR (Configurable Fault Status) and BFAR (Bus Fault Address) of the System
 * Control Block; CFSR bit 15 (BFARVALID) says whether BFAR holds the address. */
#define SCB_CFSR (*(volatile uint32_t *)0xE000ED28u)
#define SCB_BFAR (*(volatile uint32_t *)0xE000ED38u)

/* Called from probe_fault_handler with the exception frame: frame[6] is the
 * stacked PC. A fault taken by a MEM step's probing access is handed to the
 * runtime and the faulting instruction skipped, so the step reports it;
 * any other fault stops the probe. */
void probe_cortex_m_fault_report(uint32_t *frame)
{
    uint32_t cfsr = SCB_CFSR;
    uint32_t bfar = SCB_BFAR;
    if (probe_fault_in_mem_step((cfsr & 0x8000u) ? bfar : 0u)) {
        /* Skip the faulting instruction: Thumb-2 is 4 bytes when the first
         * halfword is 0b11101, 0b11110 or 0b11111, else 2 bytes. */
        uint16_t first = *(uint16_t *)(uintptr_t)frame[6];
        frame[6] += ((first & 0xF800u) >= 0xE800u) ? 4u : 2u;
        SCB_CFSR = cfsr; /* write-one-to-clear */
        return;
    }
    probe_fault_stop(frame[6], "cfsr", cfsr, "bfar", bfar);
}

__attribute__((naked)) void probe_fault_handler(void)
{
    __asm volatile("mrs r0, msp\n bl probe_cortex_m_fault_report\n bx lr");
}

void probe_cpu_idle(void)
{
    for (;;) {
        __asm volatile("wfi");
    }
}

void probe_cpu_barrier(void)
{
    __asm volatile("dsb" ::: "memory");
}
