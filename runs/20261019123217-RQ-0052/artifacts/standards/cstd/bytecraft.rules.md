# cstd Rev.AA — group bytecraft (40 rules)

## C-108 | Portability | bytecraft

**Description:** Bitfields shall not be used.

**Rationale:** Portability

**Example:**

```c
#include <stdint.h>

/* Non-compliant: bitfield is used */
typedef struct
{
   uint32_t enable : 1;
   uint32_t mode : 2;
}StatusNonCompliantType;

/* Compliant */
/* Fixed-width object with masks is used */
typedef struct
{
   uint32_t statusValue;
}StatusCompliantType;

#define STATUS_ENABLE_MASK 0x00000001U
#define STATUS_MODE_MASK 0x00000006U
```

**Notes:** Bitfields are implementation-dependent in layout and access behavior and therefore reduce portability.

## C-109 | Safety | bytecraft

**Secondary class:** Maintainability

**Description:** Standard Library functions shall not be used.

**Rationale:** Bare-Metal programming is applied throughout this project. Therefore, only the intended functionality with requirements is used.

**Example:**

```c
#include <stdint.h>

void processCopy(void)
{
   uint8_t sourceBuffer[4] = { 1U, 2U, 3U, 4U };
   uint8_t targetBuffer[4] = { 0U, 0U, 0U, 0U };
   uint32_t indexValue     = 0U;

/* Non-compliant: standard library function is used */
(void)memcpy(targetBuffer,
sourceBuffer,
sizeof(sourceBuffer));

/* Compliant: controlled project-specific copy is used */
for (indexValue = 0U; indexValue < 4U; indexValue++)
{
      targetBuffer[indexValue] = sourceBuffer[indexValue];
   }
}
```

**Notes:** In this project, bare-metal implementation is intended; therefore, only explicitly required and controlled functionality shall be used.

## C-110 | Readability | bytecraft

**Secondary class:** Consistency and Convention

**Description:** File names shall be chosen as descriptive and meaningful.

**Rationale:** Consistency and convention.

**Example:**

```c
/* Non-compliant */
a.c
x1.h
tmp.c
/* Compliant */
temperatureCalculation.c
sensorCoefficients.h
navWpChk.c
dbgPrint.c
```

**Notes:** Descriptive file names improve navigation, readability, and long-term maintainability of the codebase.

## C-111 | Consistency and Convention | bytecraft

**Description:** File names shall have two parts, a base name and an extension.

**Rationale:** Consistency and convention.

**Example:**

```c
/* Non-compliant */
temperatureCalculation
sensorCoefficients
startup
/* Compliant */
temperatureCalculation.c
sensorCoefficients.h
startup.s
```

**Notes:** A consistent filename structure simplifies tool usage, review, and project organization.

## C-112 | Consistency and Convention | bytecraft

**Secondary class:** Portability

**Description:** Extension of all implementation files shall be “.c” and extension of all header files shall be “.h” and assembly files shall be “.s”.

**Rationale:** Consistency and convention.

**Example:**

```c
/* Non-compliant */
temperatureCalculation.cpp
sensorCoefficients.hpp
startup.asm
/* Compliant */
temperatureCalculation.c
sensorCoefficients.h
startup.s
```

**Notes:** Standardized extensions improve tool compatibility and make file purpose immediately recognizable.

## C-113 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** Filenames shall be in camel notation and begin with lowercase letter.

**Rationale:** Style and convention.

**Example:**

```c
/* Non-compliant */
TemperatureCalculation.c
temperature_calculation.c
temperature-calculation.c

/* Compliant */
temperatureCalculation.c
sensorCoefficients.h
navWpChk.c
```

**Notes:** Consistent filename style improves readability and reduces naming variability across the project.

## C-114 | Portability | bytecraft

**Secondary class:** Consistency and Convention

**Description:** Any directory name on which project depends shall not include white spaces (tabs, spaces, etc.) or punctuation characters. Only allowable character set for these names are ‘0-9’, (English alphabet) ‘A-Z’, (English alphabet) ‘a-z’, ‘_’.

**Rationale:** Consistency and convention

**Example:**

```c
/* Non-compliant */
Project Files
driver-source
config.v1
TürkçeDizin
/* Compliant */
projectFiles
driver_source
configV1
buildOutput
```

**Notes:** Restricted directory names improve portability across tools, scripts, and operating systems.

## C-115 | Portability | bytecraft

**Secondary class:** Consistency and Convention

**Description:** In addition, the uniqueness of filenames shall not be due solely to a difference in case.

**Rationale:** Consistency and convention

**Example:**

```c
/* Non-compliant */
sensorData.c
SensorData.c

/* Compliant */
sensorData.c
sensorDataHandler.c
```

**Notes:** Case-only distinctions in file names may cause conflicts on case-insensitive file systems.

## C-116 | Portability | bytecraft

**Secondary class:** Consistency and Convention

**Description:** Source and header files (including comment sections) shall not contain special characters (characters other than the ones in the English alphabet, such as characters from Turkish alphabet).

**Rationale:** Consistency and convention

**Example:**

```c
#include <stdint.h>

/* Non-compliant: comment contains special characters */
void processValueNonCompliant(void)
{
   uint32_t sicaklikDegeri = 0U;
/* sıcaklık ölçümü başlatıldı */
}
/* Compliant: only English alphabet characters are used */
void processValueCompliant(void)
{
   uint32_t temperatureValue = 0U;
/* temperature measurement started */ 
}
```

**Notes:** Restricting files to English-alphabet characters improves portability across compilers, editors, and build environments.

## C-117 | Portability | bytecraft

**Secondary class:** Consistency and Convention

**Description:** Source code file names shall be composed of characters from the set of (English alphabet) [a-z], (English alphabet) [A-Z], [0-9] and shall begin with a letter.

**Rationale:** Consistency and Convention

**Example:**

```c
/* Non-compliant */
1driver.c
driver-module.c
driver_module.c
config@main.h

/* Compliant */
driverModule.c
configMain.h
adc1Driver.c
```

**Notes:** Restricting filename characters avoids toolchain issues and improves portability.

## C-118 | Consistency and Convention | bytecraft

**Secondary class:** Style and Convention

**Description:** In naming of identifiers, camel notation shall be used.

**Rationale:** Consistency and Convention

**Example:**

```c
/* Non-compliant: camel notation is not used */
uint32_t ground_speed_kmph = 0U;
uint32_t Groundspeedkmph = 0U;

/* Compliant: camel notation is used */
uint32_t groundSpeedKMpH = 0U; 
uint32_t wheelSpeedRpm = 0U;
```

**Notes:** Consistent identifier naming improves readability and makes interfaces easier to review. Reference to Chapter 6 for Abbreviations and Units.

## C-119 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** Names of the following types shall begin with an upper case letter: • structures, • type definitions • enumerated types

**Rationale:** Style and Convention

**Example:**

```c
/* Non-compliant */
typedef struct point{
   uint32_t x;
   uint32_t y;
}pointType;

enum fruit{
   APPLE,
   BANANA
};

/* Compliant */
typedef struct Point{
   uint32_t x;
   uint32_t y;
} PointType;

enum Fruit{
   APPLE,
   BANANA
};
```

**Notes:** Consistent capitalization of type names helps distinguish types from variables and functions.

## C-120 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** Names of the following shall begin with a lower case letter: • functions • objects • variables • fields within structures

**Rationale:** Style and Convention

**Example:**

```c
#include <stdint.h>
#include <stdbool.h>

/* Non-compliant */
typedef struct SensorData
{
   uint32_t TemperatureValue;
   uint32_t PressureValue;
} SensorDataType;

static bool IsLimiterEnabled = false;

void UpdateSensorData(void)
{
   uint32_t GroundSpeedKMpH = 0U;
}

/* Compliant */
typedef struct SensorData
{
   uint32_t temperatureValue;
   uint32_t pressureValue;
} SensorDataType;

static bool isLimiterEnabled = false;

void updateSensorData(void)
{
   uint32_t groundSpeedKMpH = 0U;
}
```

**Notes:** Consistent lowercase naming for objects and functions improves readability and avoids visual ambiguity.

## C-121 | Readability | bytecraft

**Secondary class:** Maintainability

**Description:** Literal constants shall not be used in code; instead, symbolic constants shall be defined and used.

**Rationale:** Readability, maintainability, type safety

**Example:**

```c
#include <stdint.h>

#define SPEED_LIMIT_KMPH 120U
#define SAMPLE_COUNT 256U

typedef enum{
   NO_BLINK = 0,
   ONE_BLINK = 1,
   THREE_BLINKS = 3
}CautionBlinksType;

void masterCautionBlink(CautionBlinksType blinkCount);

void processLiterals(uint32_t speed)
{
   uint32_t indexValue = 0U;
   int32_t samples[SAMPLE_COUNT];

/* Non-compliant: literal constants are used directly */
   if (speed > 120U){
      masterCautionBlink((CautionBlinksType)3);
   }

   for (indexValue = 0U; indexValue < 256U; indexValue++)
   {
      samples[indexValue] = 0;
   }

/* Compliant: symbolic constants are used */
   if (speed > SPEED_LIMIT_KMPH)
   {
      masterCautionBlink(THREE_BLINKS);
   }

   for (indexValue = 0U;
indexValue < SAMPLE_COUNT;
indexValue++)
{
      samples[indexValue] = 0;
   }
}

/* Compliant example */
#define SAMPLE_COUNT 256U

int samples[SAMPLE_COUNT];

for (int i = 0; i < SAMPLE_COUNT; ++i)
{
samples[i] = 0;
}
```

**Notes:** Symbolic constants make intent explicit and simplify maintenance when values need to change.

## C-122 | Consistency and Convention | bytecraft

**Secondary class:** Style and Convention

**Description:** Global constants shall be all caps with '_' separators.

**Rationale:** Consistency and Convention, Readability

**Example:**

```c
/* Non-compliant */
#define label133BitMask 0XCCFF0000UL

/* Compliant */
#define LABEL_133_BIT_MASK 0XCCFF0000UL

typedef enum
{
   APPLE = 0,
   BANANA = 1,
   CRANBERRY = 2,
   DURIAN = 3
}FruitType;
```

**Notes:** A consistent format for global constants makes them easy to recognize during implementation and review.

## C-123 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** Hexadecimal constants shall be represented using uppercase letters.

**Rationale:** Consistency and Convention, Readability

**Example:**

```c
/* Non-compliant */
#define LABEL_133_BIT_MASK_NONCOMPLIANT 0xCcFf0000uL

/* Compliant */
#define LABEL_133_BIT_MASK_COMPLIANT 0XCCFF0000UL
```

**Notes:** Uppercase hexadecimal notation improves readability and visual consistency.

## C-124 | Readability | bytecraft

**Description:** Identifiers shall not begin with the underscore character ‘_’.

**Rationale:** Readability

**Example:**

```c
/* Non-compliant */
static uint32_t _counterValue = 0U;

/* Compliant */
static uint32_t counterValue = 0U;
```

**Notes:** The underscore ‘_’ character may not be seen on screen. And usually mixed up with another identifiers without underscore character. Leading underscores may be visually unclear and may also conflict with reserved implementation identifiers.

## C-125 | Portability | bytecraft

**Secondary class:** Safety

**Description:** Built in compiler functions shall not be used.

**Rationale:** Portability, Safety

**Example:**

```c
#include <stdint.h>

static uint32_t countSetBits(uint32_t inputValue)
{
   uint32_t bitCount = 0U;

   while (inputValue != 0U){
      bitCount = bitCount + (inputValue & 1U);
      inputValue = inputValue >> 1U;
   }

   return bitCount;
}
void processBuiltInFunction(void)
{
   uint32_t inputValue = 0X0FU;
   uint32_t resultValue = 0U;

/* Non-compliant: compiler built-in function is used */
   resultValue = __builtin_popcount(inputValue);
/* Compliant: project-controlled implementation is used */
   resultValue = countSetBits(inputValue);
}
```

**Notes:** Compilers may have built in functions. But their requirements or implementations may be different than the intention of usage in the project. Usually, they don’t have requirements but specifications. Compiler built-ins may be compiler-specific and may not provide the required level of traceability or portability.

## C-126 | Readability | bytecraft

**Secondary class:** Consistency and Convention

**Description:** All definitions, declarations, and comments shall be written in English.

**Rationale:** Readability

**Example:**

```c
#include <stdint.h>

/* Non-compliant: comment and others are not in English */
void sicaklikHesapla(void)
{
/* sicaklik olcumu baslatildi */
   uint32_t sicaklikDegeri = 0U; 
}
/* Compliant: declarations and comments are in English */
void calculateTemperature(void)
{
   /* temperature measurement started */
uint32_t temperatureValue = 0U; 
}
```

**Notes:** A single project language improves readability, collaboration, and review consistency.

## C-127 | Readability | bytecraft

**Description:** Literal suffixes shall use uppercase rather than lowercase letters.

**Rationale:** Readability

**Example:**

```c
/* Non-compliant */
#define MAX_SIZE_NONCOMPLIANT 100l
/* Compliant */
#define MAX_SIZE_COMPLIANT 100L
```

**Notes:** Uppercase suffixes are easier to distinguish and reduce confusion with digits such as 1.

## C-128 | Readability | bytecraft

**Secondary class:** Portability

**Description:** Tabs shall not be used.

**Rationale:** Readability, portability

**Example:**

```c
#include <stdint.h>

/* Non-compliant */
void processValue(void)
{
<TAB>uint32_t value = 0U;
}

/* Compliant */
void processValue(void)
{
   uint32_t value = 0U;
}
```

**Notes:** Editors may have different TAB sizes for each different computer environments and may cause scattered unreadable code. Modern editors have “Convert Tabs to Spaces” capability. Tabs may be displayed differently across editors and environments, causing inconsistent formatting.

## C-129 | Readability | bytecraft

**Description:** There shall be only one statement per line even though the statements are very closely related.

**Rationale:** Readability

**Example:**

```c
#include <stdint.h>

void processStatements(void)
{
   uint32_t valueA = 5U;
   uint32_t valueB = 10U;
   uint32_t sumValue = 0U;

/* Non-compliant: more than one statement on same line */
   sumValue = valueA + valueB; valueA = 0U;

/* Compliant: one statement per line */
   sumValue = valueA + valueB;
   valueA = 0U;
}
```

**Notes:** Limiting one statement per line improves readability and simplifies debugging and review.

## C-130 | Portability | bytecraft

**Secondary class:** Maintainability

**Description:** All uses of the #pragma directive shall be documented by a comment in the source or header file.

**Rationale:** Portability, Maintainability

**Example:**

```c
/* Non-compliant */
#pragma GCC optimize ("O3")

/* Compliant: works for GCC only */
#pragma GCC optimize ("O3")

/* Compliant: works for Clang only */
#pragma clang loop unroll_count(4)
```

**Notes:** The #pragma directive is used to provide compiler-specific features and control the behavior of the program. It allows developers to implement features that may not be available in all compilers, ensuring compatibility across different platforms.

## C-131 | Readability | bytecraft

**Secondary class:** Safety

**Description:** Bracing shall be used for all if statements and else statements wrapped in a #if - #else - #endif. The wrapped if statements shall contain both braces and statement(s).

**Rationale:** Readability

**Example:**

```c
#include <stdint.h>

void doIfStuff(void);
void doElseStuff(void);

void processConditionalCompilation(bool x,
bool y,
bool z){
#if (USE_Y == 1)
   /* Non-compliant */
   if ((x == true) && (y == true))
#else
   /* Non-compliant */
   if ((x == true) && (z == true))
#endif
      doIfStuff();
   else{
      doElseStuff();
   }

#if (USE_Y == 1)
   /* Compliant */
   if ((x == true) && (y == true))
{
      doIfStuff();
   }
#else
   /* Compliant */
   if ((x == true) && (z == true))
{
      doIfStuff();
   }
#endif
   else
{
      doElseStuff();
   }
}
```

**Notes:** Explicit bracing within conditional compilation blocks prevents structural ambiguity and review mistakes.

## C-132 | Maintainability | bytecraft

**Secondary class:** Readability

**Description:** Any function shall not contain more than 200 source lines of code (SLOCs).

**Rationale:** Readability, Mainainability

**Example:**

```c
#include <stdint.h>

/* Non-compliant */
/* Function exceeds 200 source lines of code */
void processLargeFunctionNonCompliant(void)
{
   /* 201+ lines of implementation */
}

/* Compliant */
/* Functionality is split into smaller functions */
static void processPartA(void)
{
   /* part A */
}

static void processPartB(void)
{
   /* part B */
}

void processLargeFunctionCompliant(void)
{
   processPartA();
   processPartB();
}
```

**Notes:** Restricting function length helps preserve readability, reviewability, and modular design. See also (Complexity/ nesting restriction rules)

## C-133 | Maintainability | bytecraft

**Secondary class:** Readability

**Description:** Functions shall not have more than 10 arguments.

**Rationale:** Readability, maintainability, portability

**Example:**

```c
#include <stdint.h>

/* Non-compliant */
/* Function has more than 10 arguments */
void processDataNonCompliant
(
   uint32_t arg1,
   uint32_t arg2,
   uint32_t arg3,
   uint32_t arg4,
   uint32_t arg5,
   uint32_t arg6,
   uint32_t arg7,
   uint32_t arg8,
   uint32_t arg9,
   uint32_t arg10,
   uint32_t arg11
);

/* Compliant */
/* Related data is grouped into a structure */
typedef struct ProcessDataArgs
{
   uint32_t arg1;
   uint32_t arg2;
   uint32_t arg3;
   uint32_t arg4;
   uint32_t arg5;
   uint32_t arg6;
   uint32_t arg7;
   uint32_t arg8;
   uint32_t arg9;
   uint32_t arg10;
   uint32_t arg11;
} ProcessDataArgsType;

void processDataCompliant
(const ProcessDataArgsType *argsPtr);
```

**Notes:** Excessive argument counts reduce readability and often indicate that a data structure or interface redesign is needed.

## C-134 | Safety | bytecraft

**Secondary class:** Readability

**Description:** Functions shall not be declared more than once.

**Rationale:** Readability, Safety

**Example:**

```c
#include <stdint.h>

/* Non-compliant: repeated declaration */
uint32_t getStatusNonCompliant(uint32_t inputValue);
uint32_t getStatusNonCompliant(uint32_t inputValue);

uint32_t getStatusNonCompliant(uint32_t inputValue)
{
return inputValue;
}

/* Compliant: single declaration */
uint32_t getStatusCompliant(uint32_t inputValue);

uint32_t getStatusCompliant(uint32_t inputValue)
{
return inputValue;
}
```

**Notes:** Repeated declarations may reduce readability and make interface control more difficult during review.

## C-135 | Readability | bytecraft

**Secondary class:** Consistency and Convention

**Description:** Function declarations shall be placed before function definitions.

**Rationale:** Readability, Consistency and Convention

**Example:**

```c
#include <stdint.h>

/* Non-compliant */
/* Definition appears before declaration */
uint32_t getValueNonCompliant(uint32_t inputValue)
{
return inputValue;
}

uint32_t getValueNonCompliant(uint32_t inputValue);

/* Compliant */
/* Declaration appears before definition */
uint32_t getValueCompliant(uint32_t inputValue);

uint32_t getValueCompliant(uint32_t inputValue)
{
return inputValue;
}
```

**Notes:** A single declaration point before the definition improves readability and helps maintain interface consistency.

## C-136 | Portability | bytecraft

**Secondary class:** Readability

**Description:** <stdbool.h> shall be used for Boolean data types.

**Rationale:** Portability, Readability

**Example:**

```c
#include <stdint.h>

/* Non-compliant */
typedef uint8_t BoolType;
static BoolType statusNonCompliant = 0U;

/* Compliant */
static bool statusCompliant = false;
```

**Notes:** Using standard Boolean definitions improves clarity and avoids project-specific Boolean representations.

## C-137 | Safety | bytecraft

**Description:** Signed and unsigned values shall not be mixed in arithmetic or comparison operations.

**Rationale:** Safety, Portability

**Example:**

```c
#include <stdint.h>

void processSignedUnsigned(void)
{
   int32_t signedValue = -1;
   uint32_t unsignedValue = 1U;
   bool status = false;
   uint32_t resultValue = 0U;

/* Non-compliant */
/* Signed and unsigned values are mixed */
   resultValue = signedValue + unsignedValue;
/* Non-compliant */
/* Signed and unsigned val are mixedin comparison */
   if (signedValue < unsignedValue)
{
      status = true;
   }
/* Compliant */
/* Operands have the same essential type category */
   resultValue = 1U + unsignedValue;

   if (resultValue < unsignedValue)
{
      status = true;
   }
}
```

**Notes:** Mixing signed and unsigned values may produce unintended conversions and comparison results.

## C-138 | Readability | bytecraft

**Secondary class:** Safety

**Description:** Function-like macros shall not contain conditional statements.

**Rationale:** Readability, Safety

**Example:**

```c
#include <stdint.h>

/* Non-compliant */
/* Function-like macro contains conditional logic */
#define GET_MAX_NONCOMPLIANT
(a, b) (((a) > (b)) ? (a) : (b))

static uint32_t getMaxCompliant(uint32_t leftValue,
uint32_t rightValue)
{
   uint32_t resultValue = rightValue;

/* Compliant */
/* Conditional logic is implemented in a function */
   if (leftValue > rightValue)
{
      resultValue = leftValue;
   }
   return resultValue;
}

void processMacroConditional(void)
{
   uint32_t resultValue = 0U;

   resultValue = GET_MAX_NONCOMPLIANT(1U, 2U);
   resultValue = getMaxCompliant(1U, 2U);

}
```

**Notes:** Conditional logic inside function-like macros may hide control flow and make behavior harder to analyze.

## C-139 | Maintainability | bytecraft

**Secondary class:** Readability

**Description:** No function shall have a cyclomatic complexity greater than 25.

**Rationale:** Maintainability, Readability

**Example:**

```c
#include <stdbool.h>
#include <stdint.h>

/* Non-compliant: cyclomatic complexity is too high */
uint32_t processComplexityNonCompliant(
bool cond1,
bool cond2,
bool cond3,
bool cond4,
bool cond5)
{
uint32_t resultValue = 0U;

if (cond1 == true)
{
resultValue++;
}
else if (cond2 == true)
{
resultValue++;
}
else if (cond3 == true)
{
resultValue++;
}
else if (cond4 == true)
{
resultValue++;
}
else if (cond5 == true)
{
resultValue++;
}

/* ... additional branches, loops, and decisions ... */

while (resultValue < 10U)
{
if (cond1 == true)
{
resultValue++;
}

if (cond2 == true)
{
resultValue++;
}

/* ... additional decision points ... */

break;
}

return resultValue;
}

static uint32_t processPartA(bool cond1, bool cond2)
{
uint32_t resultValue = 0U;

if (cond1 == true)
{
resultValue++;
}
if (cond2 == true)
{
resultValue++;
}

return resultValue;
}

static uint32_t processPartB(bool cond3, bool cond4, bool cond5)
{
uint32_t resultValue = 0U;

if (cond3 == true)
{
resultValue++;
}
if (cond4 == true)
{
resultValue++;
}
if (cond5 == true)
{
resultValue++;
}

return resultValue;
}

/* Compliant: functionality is decomposed into simpler functions */
uint32_t processComplexityCompliant(
bool cond1,
bool cond2,
bool cond3,
bool cond4,
bool cond5)
{
uint32_t resultValue = 0U;

resultValue = processPartA(cond1, cond2);
resultValue = resultValue + processPartB(cond3, cond4, cond5);

return resultValue;
}
```

**Notes:** The cyclomatic complexity metric used by the project shall be explicitly defined and applied consistently.

## C-140 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** Braces shall be placed on a new line aligned with the associated keyword.

**Rationale:** Style, Readability

**Example:**

```c
#include <stdint.h>

void processBracePlacement(uint32_t value)
{
/* Non-compliant */
   if (value > 0U){
      value = value + 1U;
   }
   else {
      value = 0U;
   }

/* Compliant */
   if (value > 0U)
   {
      value = value + 1U;
   }
   else
   {
      value = 0U;
   }
}
```

**Notes:** A consistent brace placement style improves readability and visual structure.

## C-141 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** All block indentations shall be at three (3) spaces and be consistent within the same source file.

**Rationale:** Style, Readability

**Example:**

```c
void processIndentation(uint32_t value)
{
/* Non-compliant: indentation not 3 spaces */
if (value > 0U)
{
value = value + 1U;
}

/* Compliant: indentation 3 spaces and consistent */
   if (value > 0U)
   {
      value = value + 1U;
   }

}
```

**Notes:** Consistent indentation improves readability and makes block structure easier to understand.

## C-142 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** There shall be at least one space before or after each operator to improve readability.

**Rationale:** Style, Readability

**Example:**

```c
#include <stdint.h>

void processOperatorSpacing(void)
{
   uint32_t valueA = 1U;
   uint32_t valueB = 2U;
   uint32_t resultValue = 0U;

/* Non-compliant */
   resultValue=valueA+valueB*2U;

/* Compliant */
   resultValue = valueA + (valueB * 2U);
}
```

**Notes:** Consistent spacing around operators improves readability and reduces visual parsing errors.

## C-143 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** For fixed-point arithmetic operations, the Q format of operands and results shall be explicitly identifiable.

**Rationale:** Style, Readability

**Example:**

```c
void processFixedPointOperation(void)
{
   int32_t velocity = 256;
   int32_t gain = 128;
   int32_t resultValue = 0;

/* Non-compliant: Q format is not identifiable */
   resultValue = (velocity * gain) >> 8;

   int32_t velocityQ8 = 256;
   int32_t gainQ8 = 128;
   int32_t resultQ8 = 0;

/* Compliant */
/* Q format explicit in operand and result names */
   resultQ8 = (velocityQ8 * gainQ8) >> 8;
}
```

**Notes:** Fixed-point conventions shall be explicit so that scaling assumptions remain clear during implementation and review.

## C-144 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** There shall be at least one space before or after each operator to improve readability.

**Rationale:** Style, Readability

**Example:**

```c
#include <stdint.h>

void processOperatorSpacingRule144(void)
{
   uint32_t valueA = 3U;
   uint32_t valueB = 4U;
   uint32_t resultValue = 0U;

/* Non-compliant */
   resultValue=valueA-valueB;

/* Compliant */
   resultValue = valueA - valueB;
}
```

**Notes:** Consistent spacing around operators improves readability and reduces visual parsing errors.

## C-145 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** There shall be exactly one space after each comma in a function parameter list, and no space shall be inserted between a function name and the opening parenthesis.

**Rationale:** Style, Readability

**Example:**

```c
/* Non-compliant */
uint32_t calculateSum(uint32_t leftValue,uint32_t rightValue);
resultValue = calculateSum(leftValue,rightValue);

/* Compliant */
uint32_t calculateSum(uint32_t leftValue, uint32_t rightValue);
resultValue = calculateSum(leftValue, rightValue);
```

**Notes:** Consistent spacing in parameter and argument lists improves readability and makes function interfaces easier to review.

## C-146 | Style and Convention | bytecraft

**Secondary class:** Readability

**Description:** Fixed-point variables shall use a Q<X> suffix, where <X> represents the number of fractional bits.

**Rationale:** Style, Readability

**Example:**

```c
#include <stdint.h>

void processFixedPointNaming(void)
{
/* Non-compliant */
/* Q format is not visible in the variable name */
   int32_t velocityKmph = 1024;
   int16_t magneticHdg  = 64;

/* Compliant */
/* Q format is explicit in the variable name */
   int32_t velocityKMpHQ16 = 1024;
   int16_t magneticHdgQ8 = 64;
}
```

**Notes:** Including the Q format in the variable name makes scaling and precision assumptions visible to the reviewer.

## C-147 | Portability | bytecraft

**Secondary class:** Readability

**Description:** <stdint.h> shall be used for Fixed-width integer types.

**Rationale:** Portability, Readability

**Example:**

```c
/* Non-compliant */
unsigned short int distanceKmNonCompliant = 0U;

/* Compliant */
uint16_t distanceKmCompliant = 0U;
```

**Notes:** Fixed-width integer types make data size explicit and improve portability across targets. Also see fixed point arithmetic naming conventions.
