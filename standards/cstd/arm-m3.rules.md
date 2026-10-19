# cstd Rev.AA — group arm-m3 (17 rules)

## A-001 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Within a build configuration, a single assembler dialect shall be used; mixing dialects in the same build is forbidden.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Mixed assembler dialects in the same build

; file1.s - GNU as syntax
.syntax unified
.thumb

addOne:
adds r0, r0, #1
bx   lr

; file2.s - ARMASM syntax
AREA |.text|, CODE, READONLY

subOne PROC
SUB r0, r0, #1
BX  lr
ENDP
END


;==================== Compliant ====================
; Single assembler dialect is used consistently in same build

; file1.s - ARMASM syntax
AREA |.text|, CODE, READONLY
EXPORT addOne

addOne PROC
ADD r0, r0, #1 ; Increment input value in r0 by 1
BX  lr         ;  Return to the caller
ENDP

; file2.s - ARMASM syntax
EXPORT subOne

subOne PROC
SUB r0, r0, #1 ; Decrement input value in r0 by 1
BX  lr         ; Return to the caller
ENDP
END
```

**Notes:** Using a single assembler dialect throughout the build avoids syntax inconsistency and improves reviewability.

## A-002 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Each assembly file shall declare the instruction set state explicitly (e.g. ARM).

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Syntax and instruction set state are not declared explicitly
AREA |.text|, CODE, READONLY
EXPORT addOne

addOne PROC
ADD r0, r0, #1
BX  lr
ENDP
END
;==================== Compliant ====================
; ARMASM syntax is used and Thumb state is declared explicitly
AREA |.text|, CODE, READONLY
ARM
EXPORT addOne

addOne  PROC
ADD r0, r0, #1 ; Increment input value in r0 by 1
BX  lr         ; Return to the caller
ENDP

END
```

**Notes:** Explicitly declaring the assembly state at the start of each file improves readability and prevents ambiguity during build and review.

## A-003 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Tabs shall be avoided; indentation shall be spaces only.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Indentation uses tab characters
AREA |.text|, CODE, READONLY
THUMB
EXPORT addOne

addOne  PROC
<TAB>ADD r0, r0, #1
<TAB>BX  lr
ENDP

END
;==================== Compliant ====================
; Indentation uses spaces only
AREA |.text|, CODE, READONLY
ARM
EXPORT addOne

addOne  PROC
ADD r0, r0, #1 ; Increment input value in r0 by 1
BX  lr         ; Return to the caller
ENDP

END
```

**Notes:** Using spaces only for indentation improves formatting consistency across editors and review tools.

## A-004 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** One instruction per line shall be used; macro expansions and .macro blocks are permitted only if they improve readability and are documented.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Multiple instructions are placed on the same line
AREA |.text|, CODE, READONLY
ARM
EXPORT addOne
addOne  PROC
ADD r0, r0, #1    MOV r1, r0
BX  lr
ENDP

END
;==================== Compliant ====================
; One instruction is placed on each line
AREA |.text|, CODE, READONLY
ARM
EXPORT addOne
addOne  PROC
ADD r0, r0, #1 ; Add 1 to the input value in r0
MOV r1, r0     ; Copy the updated value from r0 to r1
BX  lr         ; Return to the caller
ENDP

END
```

**Notes:** Using one instruction per line improves readability and makes review, debugging, and traceability easier.

## A-005 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Immediate constants shall be named via EQU, except for {0,1,2,4,8,16,32} used as shift/size/align constants and other explicitly allowlisted values.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Non-trivial immediate constant is used directly

TIMEOUT_EXAMPLE_NONCOMPLIANT PROC
MOV   r0, #100
BX    lr
ENDP
;==================== Compliant ====================
; Non-trivial immediate constant is named with EQU
; Allowlisted small constants remain direct

TIMEOUT_VALUE   EQU   100

TIMEOUT_EXAMPLE_COMPLIANT PROC
MOV   r0, #TIMEOUT_VALUE ; Load named timeout constant
LSLS  r1, r1, #4         ; Shift by allowlisted constant 4
ADDS  r2, r2, #1         ; Increment by allowlisted constant 1
BX    lr                 ; Return to caller
ENDP
```

**Notes:** Non-trivial immediate constants shall be named so that intent remains explicit during review, while small allowlisted values may be used directly when their meaning is obvious.

## A-006 | Safety | arm-m3

**Description:** Any computed branch target shall have bit[0]=0; setting bit[0] is forbidden.

**Rationale:** Safety

**Example:**

```c
;==================== Non-compliant ====================
; bit[0] is set, so BX switches to Thumb state

AREA |.text_arm|, CODE, READONLY
ARM
EXPORT branchNonCompliant

branchNonCompliant PROC
LDR   r0, =thumbTarget
ORR   r0, r0, #1
BX    r0
ENDP

AREA |.text_thumb|, CODE, READONLY
THUMB

thumbTarget
BX    lr

;==================== Compliant ====================
; bit[0] is cleared, so BX remains in Arm state
; file: dispatcherJumpTable.s ve ; Allowlisted dispatcher module
AREA |.text_arm2|, CODE, READONLY
ARM
EXPORT branchCompliant

branchCompliant PROC
LDR   r0, =armTarget ; Load computed branch target address
BIC   r0, r0, #1     ; Clear bit[0] of the computed target
BX    r0             ; Branch using the state-valid target
ENDP

armTarget
BX    lr             ; Return to the caller

END
```

**Notes:** If the lowest bit is 1, the branch will switch to Thumb state. If the lowest bit is 0, the branch will switch to Arm state. Note that the lowest bit is never actually used as part of the address as all instructions are either 4-byte aligned (as in Arm) or 2-byte aligned (as in Thumb). This rule applies only to targets where bit[0] is architecturally defined as an execution-state selector.

## A-007 | Safety | arm-m3

**Description:** TBB/TBH shall only be used in allowlisted dispatcher modules and shall be preceded by explicit index bounds checking.

**Rationale:** Safety

**Example:**

```c
;==================== Non-compliant ====================
; TBB/TBH are used without explicit bounds checking
AREA |.text|, CODE, READONLY
THUMB
EXPORT dispatchTbbNonCompliant
EXPORT dispatchTbhNonCompliant
dispatchTbbNonCompliant PROC
ADR   r1, jumpTableByte
TBB   [r1, r0]
jumpTableByte
DCB   0, 1
ENDP
dispatchTbhNonCompliant PROC
ADR   r1, jumpTableHalf
TBH   [r1, r0, LSL #1]
jumpTableHalf
DCW   0, 2
ENDP
END
;==================== Compliant ====================
; TBB/TBH are used only after explicit bounds checking
; file: dispatcherJumpTable.s ve ; Allowlisted dispatcher module
EXPORT dispatchTbbCompliant
EXPORT dispatchTbhCompliant
dispatchTbbCompliant PROC
CMP   r0, #2         ; Compare index against table size
BCS   defaultCaseTbb ; Branch if index is out of range

; Load byte jump table base address
ADR   r1, jumpTableByteCompliant
; Branch through byte table using checked index
TBB   [r1, r0]
defaultCaseTbb
BX    lr        ; Return on default path
jumpTableByteCompliant
DCB   0, 1      ; Define byte table entries
ENDP
dispatchTbhCompliant PROC
CMP   r0, #2            ; Compare index against table size
BCS   defaultCaseTbh    ; Branch if index is out of range
; Load halfword jump table base address
ADR   r1, jumpTableHalfCompliant
; Branch through halfword table using checked index
TBH   [r1, r0, LSL #1]
defaultCaseTbh
BX    lr   ; Return on default path
jumpTableHalfCompliant
DCW   0, 2 ; Define halfword table entries
ENDP
END
```

**Notes:** By using these instructions, the programmer can control the branch behavior of the program, which is crucial for maintaining the integrity of the dispatcher's logic and preventing potential out-of-bounds or unpredictable behavior. The explicit index bounds checking ensures that the programmer can verify the bounds of the index used in the branch, thus preventing any unintended or incorrect behavior that could compromise the dispatcher's functionality.

## A-008 | Safety | arm-m3

**Description:** Direct writes to PC (e.g., mov pc,*, add pc,*, ldr pc,*) shall be prohibited. Function returns shall use only bx lr or pop {...,pc}. Exception returns shall use only architecturally valid bx lr EXC_RETURN sequences.

**Rationale:** Safety

**Example:**

```c
;==================== Non-compliant ====================
; Direct writes to PC are used
AREA |.text|, CODE, READONLY
THUMB
EXPORT jumpNonCompliant
EXPORT returnNonCompliant

jumpNonCompliant PROC
LDR   pc, =targetLabel
ENDP
returnNonCompliant PROC
MOV   pc, lr
ENDP
targetLabel
BX    lr
```

**Notes:** The prohibition on direct write to the PC in ARM architecture is primarily to enforce a load-store model for memory access. This means that all memory operations must be performed using load (LDR) and store (STR) instructions, rather than directly modifying the program counter.

## A-009 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Any assembly function shall not exceed 80 SLOC (excluding blank lines and comments). Exceptions (startup, context switch, vector table) shall be explicitly allowlisted or justified.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Function is too long and exceeds 80 SLOC
AREA |.text|, CODE, READONLY
THUMB
EXPORT processDataNonCompliant

processDataNonCompliant PROC
PUSH  {r4-r7, lr}
MOV   r4, r0
MOV   r5, r1
MOV   r6, r2
MOV   r7, r3

ADD   r4, r4, #1
SUB   r5, r5, #1
EOR   r6, r6, r4
ORR   r7, r7, r5
CMP   r4, #0
BEQ   skipBlock1

skipBlock1
; ... many additional instruction blocks ...
; ... total function length exceeds 80 SLOC ...
; ... startup/context-switch/vector-table exception not justified ...

POP   {r4-r7, pc}
ENDP
;==================== Compliant ====================
; Long logic is split into smaller functions below the SLOC limit
EXPORT processDataCompliant
EXPORT processDataPartA
EXPORT processDataPartB

processDataCompliant PROC
PUSH  {lr}               ; Save return address
BL    processDataPartA   ; Execute first part of the logic
BL    processDataPartB   ; Execute second part of the logic
POP   {pc}               ; Return to the caller
ENDP

processDataPartA PROC
ADD   r0, r0, #1         ; Increment r0
SUB   r1, r1, #1         ; Decrement r1
BX    lr                 ; Return to the caller
ENDP

processDataPartB PROC
EOR   r2, r2, r0      ; Apply exclusive-OR using r0 and r2
ORR   r3, r3, r1      ; Apply inclusive-OR using r1 and r3
BX    lr              ; Return to the caller
ENDP

END
```

**Notes:** Assembly functions should remain small enough for effective review, and any function exceeding the SLOC limit shall be explicitly allowlisted or justified.

## A-010 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Each assembly file shall place all code and data into explicit, named sections; implicit/default section placement shall not be relied upon.

**Rationale:** Safety

**Example:**

```c
;==================== Non-compliant ====================
; Code and data are not both placed into explicit named sections

THUMB
EXPORT readValueNonCompliant

readValueNonCompliant PROC
LDR   r0, =tableValue
LDR   r0, [r0]
BX    lr
ENDP
tableValue
DCD   0x12345678

;==================== Compliant ====================
; Code and data are placed into explicit named sections

AREA |.text|, CODE, READONLY
THUMB
EXPORT readValueCompliant

readValueCompliant PROC
LDR   r0, =tableValueCompliant ; Load address of data obj
LDR   r0, [r0] ; Read data value from memory
BX    lr       ; Return to the caller
ENDP

AREA |.rodata|, DATA, READONLY
tableValueCompliant
DCD   0x12345678   ; Define read-only constant data

END
```

**Notes:** Sections/segments define where code and data are placed in the object file.

## A-011 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Each assembly function/submodule shall include an assembly function prolog.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;====================== Compliant ====================

;----------------------------------------------------------------- 
; FUNCTION NAME:
; moduleTemplate_reverseBytes_u32
;
; PURPOSE:
; Reverses the byte order of a 32-bit unsigned value.
;
; INPUT PARAMETERS:
; r0 Input value to be byte-reversed
;
; OUTPUT PARAMETERS:
; r0 Byte-reversed result
;
; RETURNS:
; r0 Byte-reversed 32-bit value
;
; NOTES:
; Rule 162: Allowlisted module: byteOrder.s
; Rule 162: Deviation record: DEV-ASM-003
; Rule 162: Reviewer approval: Low-level reviewer approved
;
;-----------------------------------------------------------------
; FUNC_BEGIN moduleTemplate_reverseBytes
moduleTemplate_reverseBytes
   REV r0, r0 ; Reverse the byte order of the 32-bit value in r0
   BX lr      ; Return to the caller

; FUNC_END moduleTemplate_reverseBytes
```

**Notes:** Assembly shall only appear in approved allowlisted modules, and any newly introduced .s file shall be deviation-tracked and approved by a qualified low-level reviewer.

## A-012 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Assembly shall only be permitted in allowlisted modules. Any new .s file requires a deviation record and low-level reviewer approval.

**Rationale:** Style and Convention, Readability

**Example:**

```c
See the compliant example in Rule 160. For this rule, the allowlisted module name, deviation record, and low-level reviewer approval shall be stated explicitly in the NOTES section of the assembly function/file prolog.
```

**Notes:** See the compliant example in Rule 160. For this rule, the allowlisted module name, deviation record, and low-level reviewer approval shall be stated explicitly in the NOTES section of the assembly function/file prolog.

## A-013 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** All labels shall begin in column 1 to be recognized by the assembler.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Label is indented and does not begin in column 1
AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_loopExample

moduleTemplate_loopExample
MOV   r0, #3
B     loopStart
+++++loopStart
SUBS  r0, r0, #1
BNE   loopStart
BX    lr

END
;==================== Compliant ====================
; Label begins in column 1
AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_loopExampleCompliant
moduleTemplate_loopExampleCompliant
MOV   r0, #3  ; Load loop counter initial value into r0
B     loopStartCompliant ; Branch to the loop label
loopStartCompliant
SUBS  r0, r0, #1 ; Decrement the loop counter
BNE   loopStartCompliant ; Repeat loop while counter is not zero
BX    lr ; Return to the caller

END
```

**Notes:** Labels shall start in column 1 so they are visually distinct from instructions and are recognized consistently by the assembler and review tools.

## A-014 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** The comment character shall delimit comments.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Comment is not delimited with the assembly comment character
AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_addOne
moduleTemplate_addOne
ADD   r0, r0, #1   /* Non-compliant comment style */
BX    lr
;==================== Compliant ====================
; Comment is delimited with the assembly comment character
AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_addOneCompliant
moduleTemplate_addOneCompliant
ADD   r0, r0, #1   ; Compliant comment style
BX    lr           ; Return to the caller
END
```

**Notes:** Comments shall be introduced with the assembler’s defined comment character so that source lines remain readable and are parsed consistently by the toolchain.

## A-015 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** Every operation in assembly code shall have a corresponding comment which explains the operation.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Not every operation has a corresponding explanatory comment

AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_addTwo

moduleTemplate_addTwo
ADD   r0, r0, #2
BX    lr

;==================== Compliant ====================
; Every operation has a corresponding explanatory comment

AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_addTwoCompliant

moduleTemplate_addTwoCompliant
ADD   r0, r0, #2   ; Add constant 2 to input value in r0
BX    lr           ; Return to the caller

END
```

**Notes:** Each assembly operation shall include a brief explanatory comment so that intent remains clear during review and maintenance.

## A-016 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** All assembly elements shall have a single exit point.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; Multiple exit points are used
AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_checkValue

moduleTemplate_checkValue
CMP   r0, #0
BEQ   returnZero
ADD   r0, r0, #1
BX    lr              ; First exit point

returnZero
MOV   r0, #0
BX    lr              ; Second exit point

;==================== Compliant ====================
; A single exit point is used

AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_checkValueCompliant

moduleTemplate_checkValueCompliant
CMP   r0, #0          ; Compare input value with zero
BEQ   setZero         ; Branch if input is zero
ADD   r0, r0, #1      ; Increment input value
B     exitFunction    ; Branch to single exit point

setZero
MOV   r0, #0          ; Set return value to zero

exitFunction
BX    lr              ; Single exit point

END
```

**Notes:** Using a single exit point makes assembly control flow easier to review, trace, and verify.

## A-017 | Style and Convention | arm-m3

**Secondary class:** Readability

**Description:** All symbols that are defined externally to the assembly element in which they are referenced shall be included using the external statement.

**Rationale:** Style and Convention, Readability

**Example:**

```c
;==================== Non-compliant ====================
; External symbol is referenced without an external declaration

AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_callHelper

moduleTemplate_callHelper
; External function is called without IMPORT
BL    helperFunction
BX    lr


;==================== Compliant ====================
; External symbol is declared explicitly with IMPORT

AREA |.text|, CODE, READONLY
THUMB
EXPORT moduleTemplate_callHelperCompliant
IMPORT helperFunction

moduleTemplate_callHelperCompliant
; External function is declared with IMPORT
; Call the imported external helper function
BL    helperFunction
BX    lr  ; Call the imported external helper function

END
```

**Notes:** Every externally defined symbol shall be declared explicitly with the external statement so that dependencies remain visible and reviewable.
