/* hello_ps: prints one line on the PS UART (UART1, 115200 8N1 on the ZedBoard). */
#include "xil_printf.h"

int main(void)
{
    xil_printf("hello_ps: Hello from the Zynq PS\r\n");
    return 0;
}
