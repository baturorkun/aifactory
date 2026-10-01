#include <stdint.h>
#include <string.h>

int halArinc429Read(void *handle, uint32_t *word);

static uint8_t labelTable[16];
static uint8_t frame[64];

/* The index comes off the bus and is used as is. */
void storeLabelUnchecked(void *handle)
{
    uint32_t word;
    if (halArinc429Read(handle, &word) == 0)
    {
        uint32_t index = word & 0xFFu;
        labelTable[index] = 1u;
    }
}

/* The same index, bounded first. */
void storeLabelChecked(void *handle)
{
    uint32_t word;
    if (halArinc429Read(handle, &word) == 0)
    {
        uint32_t index = word & 0xFFu;
        if (index < 16u)
        {
            labelTable[index] = 1u;
        }
    }
}

/* A length from the bus sizes a copy. */
void copyFrame(void *handle, uint8_t *out)
{
    uint32_t length;
    halArinc429Read(handle, &length);
    memcpy(out, frame, length);
}
