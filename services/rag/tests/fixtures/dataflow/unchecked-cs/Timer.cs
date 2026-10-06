using System;

namespace Antmicro.Renode.Peripherals.Timers
{
    public class Timer
    {
        public Timer()
        {
            Registers.Control.Define(this)
                .WithValueField(0, 8, writeCallback: (_, val) => { slots[val] = true; }, name: "SLOT");
        }

        private readonly bool[] slots = new bool[8];
    }
}
