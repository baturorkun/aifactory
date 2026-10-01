#include <stdint.h>

extern uint32_t radioLastWord;
static uint32_t shown;

int displayUpdate(uint32_t value)
{
    shown = value + radioLastWord;
    return (int)shown;
}
