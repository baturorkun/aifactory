# Renode peripherals

Behavioural device models for the twin, in C# (`.cs`), referenced from the
`.repl` under `platforms/`. A register-only device does not need one — describe
it in the `.repl` directly. Write a peripheral here when a device must *act*:
a status word that follows a control write, a controller that reports ready,
memory that appears only once a controller is up. The probe's WAIT and MEM
lines are what such behaviour has to reproduce for parity.
