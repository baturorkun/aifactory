#include <stdint.h>

uint32_t radioLastWord;

int displayUpdate(uint32_t value);

int radioPoll(uint32_t word, int ready)
{
    radioLastWord = word;
    if (ready)
    {
        return displayUpdate(word);
    }
    return 0;
}
