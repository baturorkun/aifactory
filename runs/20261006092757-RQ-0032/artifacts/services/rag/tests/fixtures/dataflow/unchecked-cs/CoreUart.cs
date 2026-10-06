using System;
using System.Collections.Generic;

namespace Antmicro.Renode.Peripherals.UART
{
    public class CoreUart
    {
        public void WriteDoubleWord(long offset, uint value)
        {
            var index = (int)offset / 4;
            shadow[index] = value;
            var copy = new byte[value];
            Array.Copy(buffer, 0, copy, 0, (int)value);
        }

        public void WriteWord(long offset, uint value)
        {
            var index = (int)value;
            if (index < shadow.Length)
            {
                shadow[index] = 1;
            }
        }

        private readonly uint[] shadow = new uint[64];
        private readonly byte[] buffer = new byte[16];
    }
}
