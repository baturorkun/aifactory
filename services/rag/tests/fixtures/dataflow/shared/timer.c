#include <stdint.h>

static uint32_t tickCount;
volatile uint32_t tickFlag;
static uint32_t untouched;

void TIMER_IRQHandler(void)
{
    tickCount++;
    tickFlag = 1u;
}

void mainLoop(void)
{
    if (tickFlag != 0u)
    {
        tickFlag = 0u;
        untouched = tickCount;
    }
}
