# cstd Rev.AA — group misra (107 rules)

## C-001 | Safety | misra, do178c

**Secondary class:** Security

**Description:** There shall be no occurrence of undefined or critical unspecified behavior.

**Rationale:** Safety, Security, Refer to Ref. [2] Rule 1.3,

**MISRA:** 1.3

**Example:**

```c
#include <stdint.h>

int32_t incrementValue(int32_t value)
{
/* Non-compliant */
/* Signed integer overflow causes undefined behavior */
  value = INT32_MAX;
  value = value + 1;

  return value;
}

int32_t incrementValueCompliant(int32_t value)
{
/* Compliant */
/* Overflow is prevented */
  if (value < INT32_MAX)
    {
      value = value + 1;
    }
  return value;
}
```

**Notes:** According to used C11 Standard version (Ref. [3], [4]) there are some defined undefined behaviors. This rule prevents any of those undefined behaviors that occur in the code.

## C-002 | Safety | misra, do178c

**Description:** A project shall not contain unreachable code.

**Rationale:** Safety, Refer to Ref. [2] Rule 2.1, Refer to Ref.[1] 6.4.4.3.c

**MISRA:** 2.1

**Example:**

```c
#include <stdint.h>

int32_t getStatus(void)
{
  int32_t status = 0;

  /* Non-compliant: statement below return is unreachable */
  return status;
  status = 1;

}

int32_t getStatusCompliant(void)
{
  int32_t status = 0;

  /* Compliant: no unreachable statement exists */
  status = 1;

  return status;
}
```

**Notes:** Each code piece is to perform an intended behavior. Any unreachable i.e. extraneous code shall be removed from executable object file. As an example, cases like default: clause in switch case shall be caused by a requirement otherwise it is considered extraneous.

## C-003 | Safety | misra, do178c

**Secondary class:** Maintainability

**Description:** A project shall not contain dead code.

**Rationale:** Safety, Refer to Ref. [2] Rule 2.2, Refer to Ref.[1] 6.4.4.3.c

**MISRA:** 2.2

**Example:**

```c
#include <stdint.h>

void updateValue(void)
{
  uint32_t valueNonCompliant = 0U;
  uint32_t valueCompliant = 0U;

/* Non-compliant: This assignment has no effect */
  valueNonCompliant = 1U;
  valueNonCompliant = 2U;

/* Compliant: Each assignment contribute intended behavior */
  valueCompliant = 1U;
  valueCompliant = valueCompliant + 1U;

  (void)valueNonCompliant;
  (void)valueCompliant;
}
```

**Notes:** Each code piece is to perform an intended behavior. Any unreachable i.e. extraneous code shall be removed from executable object file.

## C-004 | Maintainability | misra, do178c

**Secondary class:** Readability

**Description:** A project shall not contain unused type declarations.

**Rationale:** Refer to Ref. [2] Rule 2.3

**MISRA:** 2.3

**Example:**

```c
#include <stdint.h>

int16_t processTypeDeclaration(void)
{
/* Non-compliant : local typedef is declared but not used */
  typedef int16_t LocalTypeNonCompliant;

/* Compliant: local typedef is used */
  typedef int16_t LocalTypeCompliant;
  LocalTypeCompliant resultValue = 67;

  return resultValue;
}
```

**Notes:** If a type is declared but not used, then it is unclear to a reviewer if the type is redundant or it has been left unused by mistake.

## C-005 | Maintainability | misra, do178c

**Secondary class:** Readability

**Description:** A project shall not contain unused tag declarations.

**Rationale:** Refer to Ref. [2] Rule 2.4

**MISRA:** 2.4

**Example:**

```c
#include <stdint.h>

/* Non-compliant: tag is declared but not used */
typedef struct RecordTag
{
  uint16_t key;
  uint16_t value;
}RecordTypeNonCompliant;

/* Compliant: unnecessary tag is omitted */
typedef struct
{
  uint16_t key;
  uint16_t value;
}RecordTypeCompliant;
```

**Notes:** If a tag is declared but not used, it is unclear whether the declaration is redundant or was left unused by mistake. This may reduce readability and complicate review.

## C-006 | Maintainability | misra, do178c

**Secondary class:** Readability

**Description:** A project shall not contain unused macro definitions.

**Rationale:** Refer to Ref. [2] Rule 2.5

**MISRA:** 2.5

**Example:**

```c
#include <stdint.h>

#define SIZE_VALUE 4U
/* Non-compliant: macro is not used */
#define DATA_VALUE 3U
uint32_t getSizeValue(void)
{
/* Compliant: macro is used */
   return SIZE_VALUE;
}
```

**Notes:** If a macro is defined but not used, then it is unclear to a reviewer if the macro is redundant or it has been left unused by mistake.

## C-007 | Maintainability | misra, do178c

**Secondary class:** Readability

**Description:** A function shall not contain unused label declarations.

**Rationale:** Refer to Ref. [2] Rule 2.6

**MISRA:** 2.6

**Example:**

```c
#include <stdint.h>

void processLabel(void)
{
  uint32_t value = 6U;

/* Non-compliant: label is declared but never used */
unusedLabel:
  value = value + 1U;

/* Compliant: no unnecessary label is declared */
  value = value + 1U;

}
```

**Notes:** If a label is declared but not used, then it is unclear to a reviewer if the label is redundant or it has been left unused by mistake

## C-008 | Maintainability | misra, do178c

**Secondary class:** Safety

**Description:** A function shall not contain unused parameters.

**Rationale:** Maintainability, Refer to Ref. [2] Rule 2.7

**MISRA:** 2.7

**Example:**

```c
#include <stdint.h>

void processParameterNonCompliant(uint16_t *valuePtr,
int16_t unusedValue)
{
/* Non-compliant: parameter is not used */
  *valuePtr = 42U;
}

void processParameterCompliant(uint16_t *valuePtr,
int16_t inputValue)
{
/* Compliant: all parameters are used */
  *valuePtr = (uint16_t)inputValue;
}
```

**Notes:** Most functions will be specified as using each of their parameters. If a function parameter is unused, it is possible that the implementation of the function does not match its specification. This rule highlights such potential mismatches.

## C-009 | Maintainability | misra, do178c

**Secondary class:** Readability

**Description:** A project shall not contain unused object definitions.

**Rationale:** Refer to Ref. [2] Rule 2.8

**MISRA:** 2.8

**Example:**

```c
#include <stdint.h>

void processObjectDefinition(void)
{
/* Non-compliant: object is defined but not used */
  uint16_t retryCountNonCompliant = 0U;

/* Compliant: object is used */
  uint16_t retryCountCompliant = 0U;
  retryCountCompliant++;

}
```

**Notes:** If an object is defined but unused, then it is unclear to a reviewer if the object is redundant or it has been left unused by mistake.

## C-010 | Readability | misra

**Description:** The character sequences /* and // shall not be used within a comment.

**Rationale:** Refer to Ref. [2] Rule 3.1, Readability

**MISRA:** 3.1

**Example:**

```c
#include <stdint.h>

void checkValue(int32_t value)
{
/* Non-compliant: comment contains // sequence */
/* Previous logic was // if (value > 0) { value--; } */
  value++;

/* Compliant */
/* Comment does not contain nested comment   markers */
/* Previous decrement logic was removed */
  value++;

}
```

**Notes:** If a comment starting sequence, /* or //, occurs within a /* comment, is it quite likely to be caused by a missing */ comment ending sequence. If a comment starting sequence occurs within a // comment, it is probably because a region of code has been commented-out using //.

## C-011 | Readability | misra

**Description:** Line-splicing shall not be used in // comments.

**Rationale:** Refer to Ref. [2] Rule 3.2, Readability

**MISRA:** 3.2

**Example:**

```c
#include <stdint.h>

void updateCounter(void)
{
  uint32_t counter = 0U;

/* Non-compliant: line-splicing is used in a // comment */
// Counter update is disabled \
  counter++;

/* Compliant: no line-splicing is used */
// Counter update is documented here
  counter++;

}
```

**Notes:** The source line containing a // comment ends with a \ character in the source character set, the next line becomes part of the comment. This may result in unintentional removal of code.

## C-012 | Readability | misra

**Description:** Octal and hexadecimal escape sequences shall be terminated.

**Rationale:** Refer to Ref. [2] Rule 4.1

**MISRA:** 4.1

**Example:**

```c
#include <stdint.h>

void processEscapeSequence(void)
{
/* Non-compliant */
/* Hexadecimal escape sequence is not properly terminated */
  const char *textNonCompliant = "\x4142";

/* Compliant */
/* Hexadecimal escape sequence is properly terminated */
  const char *textCompliant = "\x41""42";

}
```

**Notes:** If the source line containing a // comment ends with a \ character in the source character set, the next line becomes part of the comment. This may result in unintentional removal of code.

## C-013 | Readability | misra

**Secondary class:** Portability

**Description:** Trigraphs shall not be used.

**Rationale:** Refer to Ref. [2] Rule 4.2, Readability

**MISRA:** 4.2

**Example:**

```c
#include <stdint.h>

/* Non-compliant: trigraphs are used instead of braces */
void initValueNonCompliant(void)
??<
  uint32_t value = 0U;
??>

/* Compliant: normal brace characters are used */
void initValueCompliant(void)
{
  uint32_t value = 0U;
}
```

**Notes:** Trigraphs are sequences of three characters that start with two question marks (??) and represent a single character. They were introduced in early C standards to allow programmers to type certain characters on keyboards that didn’t have them (e.g., {, }, #).

## C-014 | Portability | misra

**Description:** External identifiers shall be distinct.

**Rationale:** Portability, Refer to Ref. [2] Rule 5.1

**MISRA:** 5.1

**Example:**

```c
/* In the following example, the definitions all occur in the same translation unit. The implementation in question supports 31 significant case-sensitive characters in external identifiers.*/

/* Non-compliant */
/*      1234567890123456789012345678901********* */
int32_t engine_exhaust_gas_temperature_raw;
int32_t engine_exhaust_gas_temperature_scaled;

/*      1234567890123456789012345678901********* */
int32_t engine_exhaust_gas_temp_raw;
int32_t engine_exhaust_gas_temp_scaled; /* Compliant */

/* In the following non-compliant example, the implementation supports 6 significant case-insensitive
characters in external identifiers. The identifiers in the two translation units are different but are not
distinct in their significant characters. */

/* file1.c */
int32_t abc = 0;

/* file2.c */
int32_t ABC = 0;

/* Compliant */
/* file1.c */
#include <stdint.h>

int32_t exhaustGasTempRaw = 0;

/* file2.c */
#include <stdint.h>

int32_t intakeAirTempScaled = 0;
```

**Notes:** In C99 and later the minimum requirement is that the first 31 characters of external identifiers are significant, with each universal character or corresponding extended source character occupying between 6 and 10 characters.

## C-015 | Consistency and Convention | misra

**Secondary class:** Readability

**Description:** Identifiers declared in the same scope and name space shall be distinct.

**Rationale:** Refer to Ref. [2] Rule 5.2

**MISRA:** 5.2

**Example:**

```c
#include <stdint.h>

#if 0
void processDataNonCompliant(void)
{
uint32_t counter = 0U;
/* Non-compliant */
/* Identifier is redeclared in the same scope */
uint32_t counter = 1U;
}

#endif

void processDataCompliant(void)
{
uint32_t counter = 0U;
uint32_t retryCounter = 1U;
}
```

**Notes:** In C99 and later the minimum requirement is that the first 63 characters are significant, with each universal character or extended source character counting as a single character.

## C-016 | Consistency and Convention | misra

**Secondary class:** Readability

**Description:** An identifier declared in an inner scope shall not hide an identifier declared in an outer scope.

**Rationale:** Refer to Ref. [2] Rule 5.3

**MISRA:** 5.3

**Example:**

```c
#include <stdint.h>

static uint32_t systemState = 0U;

void updateStateNonCompliant(void)
{
/* Non-compliant: inner scope id hides outer scope id */
uint32_t systemState = 1U;
systemState++;
}

void updateStateCompliant(void)
{
uint32_t newSystemState = 1U;
systemState = newSystemState;
}
```

**Notes:** In C99 and later the minimum requirement is that the first 63 characters are significant, with each universal character or extended source character counting as a single character.

## C-017 | Consistency and Convention | misra

**Description:** Macro identifiers shall be distinct.

**Rationale:** Refer to Ref. [2] Rule 5.4

**MISRA:** 5.4

**Example:**

```c
#include <stdint.h>

/* Non-compliant: macro identifier is redefined */
#define BUFFER_SIZE 64U
#define BUFFER_SIZE 128U

void initBufferNonCompliant(void)
{
uint32_t size = BUFFER_SIZE;
}

/* Compliant: macro identifiers are distinct */
#define RX_BUFFER_SIZE 64U
#define TX_BUFFER_SIZE 128U

void initBufferCompliant(void)
{
uint32_t rxSize = RX_BUFFER_SIZE;
uint32_t txSize = TX_BUFFER_SIZE;

}
```

**Notes:** If macro identifiers are not distinct, preprocessing results may become ambiguous and difficult to review.

## C-018 | Consistency and Convention | misra

**Description:** Identifiers shall be distinct from macro names.

**Rationale:** Refer to Ref. [2] Rule 5.5

**MISRA:** 5.5

**Example:**

```c
#include <stdint.h>

#define TIMEOUT_MS 100U

#if 0
void waitForEventNonCompliant(void)
{
/* Non-compliant: identifier is the same as macro name */
uint32_t TIMEOUT_MS = 50U;
}

#endif

void waitForEventCompliant(void)
{
uint32_t timeoutValueMs = TIMEOUT_MS;
}
```

**Notes:** Reusing the same name for both a macro and an identifier may cause confusion and unexpected preprocessing behavior.

## C-019 | Consistency and Convention | misra

**Description:** A typedef name shall be a unique identifier.

**Rationale:** Refer to Ref. [2] Rule 5.6

**MISRA:** 5.6

**Example:**

```c
#include <stdint.h>

/* Non-compliant: typedef name is reused */
typedef uint8_t SignalType;
typedef uint16_t SignalType;

/* Compliant: typedef names are unique */
typedef uint8_t Signal8Type;
typedef uint16_t Signal16Type;
```

**Notes:** Unique typedef names improve clarity and prevent confusion in declarations and interfaces.

## C-020 | Consistency and Convention | misra

**Description:** A tag name shall be a unique identifier.

**Rationale:** Refer to Ref. [2] Rule 5.7

**MISRA:** 5.7

**Example:**

```c
#include <stdint.h>

/* Non-compliant: tag name is reused */
struct DeviceTag
{
uint8_t id;
};

enum DeviceTag
{
DEVICE_OFF = 0,
DEVICE_ON = 1
};

/* Compliant: tag names are unique */
struct DeviceStructTag
{
uint8_t id;
};

enum DeviceStateTag
{
DEVICE_STATE_OFF = 0,
DEVICE_STATE_ON = 1
};
```

**Notes:** Unique tag names prevent ambiguity in structure and enumeration declarations.

## C-021 | Consistency and Convention | misra

**Description:** Identifiers that define objects or functions with external linkage shall be unique.

**Rationale:** Refer to Ref. [2] Rule 5.8

**MISRA:** 5.8

**Example:**

```c
file1.c
#include <stdint.h>

/* Non-compliant */
/* External object identifier is not unique */
uint32_t systemStatus = 0U;

file2.c
#include <stdint.h>

/* Non-compliant */
/* Same external object identifier is defined again */
uint32_t systemStatus = 1U;
```

**Notes:** External linkage identifiers are visible across translation units; therefore, uniqueness shall be preserved project-wide.

## C-022 | Consistency and Convention | misra

**Secondary class:** Maintainability

**Description:** Identifiers that define objects or functions with internal linkage shall be unique.

**Rationale:** Refer to Ref. [2] Rule 5.9

**MISRA:** 5.9

**Example:**

```c
file1.c
#include <stdint.h>

/* Non-compliant */
/* Internal linkage identifier duplicated in another file */
static void ProcessData(void)
{
}

file2.c
#include <stdint.h>

/* Non-compliant */
/* Same internal linkage identifier appears again */
static void ProcessData(void)
{
}
```

**Notes:** Although internal linkage limits visibility to one translation unit, unique naming is still recommended for maintainability and reviewability.

## C-023 | Portability | misra

**Secondary class:** Safety

**Description:** A reserved identifier or reserved macro name shall not be declared.

**Rationale:** Refer to Ref. [2] Rule 5.10

**MISRA:** 5.10

**Example:**

```c
#include <stdint.h>

/* Non-compliant: reserved identifier is declared */
#define __MAX_BUFFER_SIZE 64U
/* Compliant: non-reserved identifier is declared */
#define MAX_BUFFER_SIZE 64U
```

**Notes:** Reserved identifiers and macro names may conflict with compiler, standard library, or toolchain internals and shall therefore be avoided.

## C-024 | Portability | misra

**Secondary class:** Safety

**Description:** A “u” or “U” suffix shall be applied to all integer constants that are represented in an unsigned type.

**Rationale:** Refer to Ref. [2] Rule 7.2

**MISRA:** 7.2

**Example:**

```c
#include <stdint.h>

void InitTimeout(void)
{
/* Non-compliant */
/* Unsigned integer constant has no U suffix */
  uint32_t timeout1 = 1000;

/* Compliant: unsigned integer constant uses U suffix */
  uint32_t timeout2 = 1000U;

}
```

**Notes:** Applying the correct unsigned suffix makes the intended type explicit and helps prevent implicit signed/unsigned conversion issues.

## C-025 | Readability | misra

**Description:** The lowercase character “l” shall not be used in a literal suffix.

**Rationale:** Refer to Ref. [2] Rule 7.3

**MISRA:** 7.3

**Example:**

```c
#include <stdint.h>

void InitValue(void)
{
/* Non-compliant: lowercase l suffix is used */
  uint32_t value1 = 100l;

/* Compliant: uppercase L or U suffix is used */
  uint32_t value2 = 100UL;

}
```

**Notes:** The lowercase letter “l” can easily be confused with the digit “1”, reducing readability

## C-026 | Safety | misra

**Secondary class:** Portability

**Description:** A string literal shall not be assigned to an object unless the object’s type is “pointer to const-qualified char”.

**Rationale:** Refer to Ref. [2] Rule 7.4

**MISRA:** 7.4

**Example:**

```c
#include <stdint.h>

void PrintMessage(void)
{
/* Non-compliant */
/* String literal assigned to non-const pointer */
  char *message1 = "System ready";

/* Compliant */
/* String literal assigned to pointer to const char */
  const char *message2 = "System ready";

}
```

**Notes:** String literals are not modifiable; assigning them to a non-const-qualified pointer may lead to undefined behavior.

## C-027 | Portability | misra

**Secondary class:** Safety

**Description:** The argument of an integer constant macro shall have an appropriate form.

**Rationale:** Refer to Ref. [2] Rule 7.5

**MISRA:** 7.5

**Example:**

```c
#include <stdint.h>

/* Compliant */
uint32_t u1 = UINT32_C( 10 );
/* Non-compliant - constant is suffixed */
uint32_t u2 = UINT32_C( 10UL );
/* Non-compliant - constant expression */
uint16_t u4 = UINT16_C( -2 );
/* Non-compliant - constant expression */
int32_t s1 = INT32_C( -2 );
/* Compliant */
int32_t s2 = -INT32_C( 2 );

/*In the following example, the constant has a value that cannot be represented in 16 bits. */

uint_least16_t u5 = UINT16_C ( 0x10000 );
/* Non-compliant,
even if uint_least16_t is implemented as a 32-bit type */
```

**Notes:** Integer constant macros shall be written in a form that clearly preserves the intended width and signedness.

## C-028 | Portability | misra

**Description:** The small integer variants of the minimum-width integer constant macros shall not be used.

**Rationale:** Refer to Ref. [2] Rule 7.6

**MISRA:** 7.6

**Example:**

```c
#include <stdint.h>

void processIntegerConstant(void)
{
/* Non-compliant: small integer constant macro used */
uint8_t valueNonCompliant = UINT8_C(100);

/* Compliant: direct unsigned integer literal used */
uint8_t valueCompliant = 100U;
}
```

**Notes:** Use of small integer constant macro variants may reduce portability and increase the likelihood of unintended type-related behavior.

## C-029 | Consistency and Convention | misra

**Secondary class:** Readability

**Description:** Types shall be explicitly specified.

**Rationale:** Refer to Ref. [2] Rule 8.1

**MISRA:** 8.1

**Example:**

```c
#include <stdint.h>

/* Non-compliant - implicit int type */
extern x;
/* Compliant - explicit type */
extern int16_t x;
/* Non-compliant - implicit int type */
const y;
/* Compliant - explicit type */
const int16_t y;
/* Non-compliant – implicit */
extern f ( void );
/* Compliant */
extern int16_t f ( void );
/* Non-compliant */
extern void g ( char c, const k );
/* Compliant */
extern void g ( char c, const int16_t k );
/* Non-compliant -*/
typedef ( *pfi ) ( void );
/* Compliant */
typedef int16_t ( *pfi ) ( void );
/* Non-compliant */
typedef void ( *pfv ) ( const x );
/* Compliant */
typedef void ( *pfv ) ( int16_t x );
```

**Notes:** Explicit type specification improves readability and avoids ambiguity in declarations and interfaces.

## C-030 | Consistency and Convention | misra

**Secondary class:** Readability

**Description:** Function types shall be in prototype form with named parameters.

**Rationale:** Refer to Ref. [2] Rule 8.2

**MISRA:** 8.2

**Example:**

```c
#include <stdint.h>

/* Non-compliant: parameter name is not specified */
extern void func2(int16_t);
/* Non-compliant: not in prototype form */
static int16_t func3();
/* Compliant: prototype specifies named parameter */
extern int16_t func1(int16_t inputValue);
/* Compliant: prototype explicitly specifies 0 parameters */
static int16_t func4(void);

int16_t func1(int16_t inputValue)
{
return inputValue;
}
```

**Notes:** Prototype form with named parameters improves interface clarity, enables stronger type checking, and supports safer function usage.

## C-031 | Consistency and Convention | misra

**Secondary class:** Maintainability

**Description:** All declarations of an object or function shall use the same names and type qualifiers.

**Rationale:** Refer to Ref. [2] Rule 8.3

**MISRA:** 8.3

**Example:**

```c
#include <stdint.h>

/* Compliant: same parameter name and compatible type */
extern void processValue(int32_t inputValue);
extern void processValue(int32_t inputValue);

/* Non-compliant: mismatched parameter name */
extern void updateValue(int32_t firstValue);
extern void updateValue(int32_t secondValue);

/* Non-compliant: mismatched type qualifier */
extern void readValue(int32_t * const dataPtr);
extern void readValue(int32_t *dataPtr);
```

**Notes:** Using types and qualifiers consistently across declarations of the same object or function encourages stronger typing. Specifying parameter names in function prototypes allows the function definition to be checked for interface consistency with its declarations.

## C-032 | Safety | misra

**Secondary class:** Maintainability

**Description:** A compatible declaration shall be visible when an object or function with external linkage is defined.

**Rationale:** Refer to Ref. [2] Rule 8.4

**MISRA:** 8.4

**Example:**

```c
#include <stdint.h>
/* Compliant */
extern int16_t count;
int16_t count = 0;
/* Non-compliant - no declaration prior to this definition*/
extern uint16_t speed = 6000u;
/* Non-compliant - no declaration prior to this definition*/
uint8_t pressure = 101u;
extern void func1 ( void );
extern void func2 ( int16_t x, int16_t y );
extern void func3 ( int16_t x, int16_t y );
/* Compliant */
void func1 ( void ){}
/* Compliant */
void func2 ( int16_t x, int16_t y ){ }
/* Non-compliant - parameter types different */
void func3 ( int16_t x, uint16_t y ){}
/* Non-compliant - No declaration of func4 before */
void func4 ( void ){}
/* Compliant */
/* Rule does not apply to functions with internal linkage */
static void func5 ( void ){}
```

**Notes:** A prior compatible declaration makes the interface explicit and enables consistent type checking across translation units.

## C-033 | Maintainability | misra

**Secondary class:** Consistency and Convention

**Description:** An external object or function shall be declared once in one and only one file.

**Rationale:** Refer to Ref. [2] Rule 8.5

**MISRA:** 8.5

**Example:**

```c
/* file: featureX.h */
#ifndef FEATUREX_H
#define FEATUREX_H
#include <stdint.h>
/* Compliant */
extern int16_t featureXValue;
#endif

/* file: featureX.c */
#include "featureX.h"
int16_t featureXValue = 0;
/* Non-compliant */
/* file: file1.h */
extern int16_t sharedValue;
/* file: file2.h */
extern int16_t sharedValue;
```

**Notes:** Declaring each external object or function in one and only one file improves interface control and avoids inconsistent declarations.

## C-034 | Safety | misra

**Secondary class:** Maintainability

**Description:** An identifier with external linkage shall have exactly one external definition.

**Rationale:** Refer to Ref. [2] Rule 8.6

**MISRA:** 8.6

**Example:**

```c
/*In this example the object i is defined twice: */
/* file1.c */
int16_t i = 10;

/* file2.c */
/* Non-compliant - two definitions of i */
int16_t i = 20;

/* In this example the object j has one tentative definition and one external definition: */
/* file3.c */
int16_t j;     /* Tentative definition */
int16_t j = 1; /* Compliant - external definition */

/*The following example is non-compliant because the object k has two external definitions. The tentative definition in file4.c becomes an external definition at the end of the translation unit:*/
/* file4.c */
int16_t k;     /* Tentative definition - becomes external */

/* file5.c */
int16_t k = 0; /* External definition */
```

**Notes:** Multiple external definitions may cause linkage conflicts and unpredictable behavior at build or run time.

## C-035 | Consistency and Convention | misra

**Secondary class:** Maintainability

**Description:** The static storage class specifier shall be used in all declarations of objects and functions that have internal linkage.

**Rationale:** Refer to Ref. [2] Rule 8.8

**MISRA:** 8.8

**Example:**

```c
/* Non-compliant: object has internal linkage but declaration does not use static */
static int32_t counterValue = 0;
extern int32_t counterValue;
/* Non-compliant: function definition omits static */
static int32_t getValueNonCompliant(void);
int32_t getValueNonCompliant(void)
{
  return 1;
}
/* Compliant: all declarations use static consistently */
static int32_t getValueCompliant(void);
static int32_t getValueCompliant(void)
{
  return 1;
}
```

**Notes:** Consistent use of static makes internal linkage explicit and prevents unintended external visibility.

## C-036 | Maintainability | misra

**Secondary class:** Readability

**Description:** An object shall be declared at block scope if its identifier only appears in a single function.

**Rationale:** Refer to Ref. [2] Rule 8.9

**MISRA:** 8.9

**Example:**

```c
/* Non-compliant: object is declared at file scope but used in only one function */
static uint32_t monitorCounter = 0U;
void updateMonitorNonCompliant(void)
{
monitorCounter = monitorCounter + 1U;
}
/* Compliant: object is declared at block scope because it is only used in one function */
void updateMonitorCompliant(void)
{
uint32_t monitorCounter = 0U;
monitorCounter = monitorCounter + 1U;

}
```

**Notes:** Block-scope declarations reduce visibility, improve readability, and limit unintended use outside the relevant function.

## C-037 | Portability | misra

**Secondary class:** Safety

**Description:** An inline function shall be declared with the static storage class.

**Rationale:** Refer to Ref. [2] Rule 8.10

**MISRA:** 8.10

**Example:**

```c
file1.c
/* Non-compliant: inline function not declared static */
inline uint32_t getValue(uint32_t inputValue)
{
   return inputValue + 1U;
}
file2.c
extern uint32_t getValue(uint32_t inputValue);
void processValue(void)
{
   uint32_t value = getValue(1U);
}
file3.c
/* Compliant: inline function is declared with static */
static inline uint32_t getValue(uint32_t inputValue)
{
   return inputValue + 1U;
}
file4.c
void processValue(void)
{
/* Compliant: separate translation unit does not depend on external inline definition */
   uint32_t value = 1U;
}
```

**Notes:** Declaring inline functions as static avoids multiple-definition issues and improves portability across translation units.

## C-038 | Safety | misra

**Secondary class:** Consistency and Convention

**Description:** All declarations of an object with an explicit alignment specification shall specify the same alignment.

**Rationale:** Refer to Ref. [2] Rule 8.15

**MISRA:** 8.15

**Example:**

```c
file1.c
/* Non-compliant: object declared with 8-byte alignment */
_Alignas(8) extern uint32_t bufferValue;
file2.c

/* Non-compliant: same-object defined different alignment */
_Alignas(4) uint32_t bufferValue = 0U;
file3.c
/* Compliant: object is declared with 8-byte alignment */
_Alignas(8) extern uint32_t bufferValue;
file4.c
/* Compliant: same object defined with the same alignment */
_Alignas(8) uint32_t bufferValue = 0U;
```

**Notes:** Inconsistent alignment specifications for the same object may cause incorrect assumptions about storage layout and access.

## C-039 | Maintainability | misra

**Secondary class:** Safety

**Description:** There shall be no tentative definitions in a header file.

**Rationale:** Refer to Ref. [2] Rule 8.18

**MISRA:** 8.18

**Example:**

```c
/* Non-compliant */
file1.h
#ifndef FILE1_H
#define FILE1_H
/* Tentative definition appears in header file */
uint32_t systemCounter;
#endif

file1.c
#include "file1.h"
void incrementCounter(void)
{
   systemCounter = systemCounter + 1U;
}

file2.c
#include "file1.h"
void resetCounter(void)
{
   systemCounter = 0U;
}

/* Compliant */
file1.h

#ifndef FILE1_H
#define FILE1_H
/* Only declaration appears in header file */
extern uint32_t systemCounter;
void incrementCounter(void);
void resetCounter(void);
#endif

file1.c
#include "file1.h"
/* Compliant: definition is placed in a source file */
uint32_t systemCounter = 0U;
void incrementCounter(void)
{
systemCounter = systemCounter + 1U;
}

file2.c
#include "file1.h"
void resetCounter(void)
{
systemCounter = 0U;
}
```

**Notes:** Tentative definitions in header files may lead to multiple definitions when the header is included in more than one translation unit.

## C-040 | Safety | misra

**Description:** The value of an object with automatic storage duration shall not be read before it has been set.

**Rationale:** Refer to Ref. [2] Rule 9.1

**MISRA:** 9.1

**Example:**

```c
#include <stdint.h>

uint32_t getValueNonCompliant(uint32_t condition)
{
   uint32_t result;
   if (condition > 0U)
   {
      result = 10U;
   }
/* Non-compliant: result may be read before being set */
   return result;
}

uint32_t getValueCompliant(uint32_t condition)
{
/* Compliant: object is initialized before any read */
   uint32_t result = 0U;
   if (condition > 0U)
   {
      result = 10U;
   }
   return result;
}
```

**Notes:** Reading an automatic object before initialization may result in indeterminate values and unsafe behavior.

## C-041 | Readability | misra

**Secondary class:** Safety

**Description:** The initializer for an aggregate shall be enclosed in braces.

**Rationale:** Refer to Ref. [2] Rule 9.2

**MISRA:** 9.2

**Example:**

```c
typedef struct
{
uint32_t x;
uint32_t y;
} PointType;

/* Non-compliant: initializer is not enclosed in braces */
PointType pointNonCompliant = 1U;

/* Compliant: initializer is enclosed in braces */
PointType pointCompliant = { 1U, 2U };
```

**Notes:** Braced initializers make aggregate initialization explicit and easier to review.

## C-042 | Safety | misra

**Secondary class:** Readability

**Description:** Arrays shall not be partially initialized.

**Rationale:** Refer to Ref. [2] Rule 9.3

**MISRA:** 9.3

**Example:**

```c
/* Non-compliant: array is partially initialized */
uint32_t valuesNonCompliant[4] = { 1U, 2U };

/* Compliant: all array elements explicitly initialized */
uint32_t valuesCompliant[4] = { 1U, 2U, 3U, 4U };
```

**Notes:** Partial initialization may hide unintended default values and shall be avoided in safety-critical code.

## C-043 | Safety | misra

**Description:** Operands shall not be of an inappropriate essential type.

**Rationale:** Refer to Ref. [2] Rule 10.1

**MISRA:** 10.1

**Example:**

```c
void processValue(void)
{
   int32_t signedValue = 1;
   uint32_t unsignedValue = 1U;

/* Non-compliant */
/* Bitwise operator is applied to a signed operand */
   if ((signedValue << 1) != 0)
   {
      signedValue = signedValue + 1;
   }

/* Compliant */
/* Bitwise operator is applied to an unsigned operand */
   if ((unsignedValue << 1U) != 0U)
   {
      unsignedValue = unsignedValue + 1U;
   }
}
```

**Notes:** Inappropriate essential types may cause unintended conversions, loss of meaning, or incorrect runtime behavior.

## C-044 | Safety | misra

**Description:** Expressions of essentially character type shall not be used inappropriately in addition and subtraction operations.

**Rationale:** Refer to Ref. [2] Rule 10.2

**MISRA:** 10.2

**Example:**

```c
#include <stdint.h>

void processCharacter(void)
{
   char charValue = 'A';
   uint32_t indexValue = 1U;
   char nextCharacter;
/* Non-compliant */
/* Character type is used directly in arithmetic */
   nextCharacter = charValue + 1;
/* Compliant */
/* Character arithmetic is explicit and justified */
   nextCharacter = (char)((uint32_t)'A' + indexValue);

}
```

**Notes:** Character types shall not be used as small integers unless this usage is explicit and well justified.

## C-045 | Safety | misra

**Description:** The value of an expression shall not be assigned to an object with a narrower essential type or of a different essential type category.

**Rationale:** Refer to Ref. [2] Rule 10.3

**MISRA:** 10.3

**Example:**

```c
#include <stdbool.h>
#include <stdint.h>

void updateValues(void)
{
uint32_t sourceValue = 1U;
uint8_t smallValue = 0U;
bool enableFlag = false;
/* Non-compliant: narrower essential type */
smallValue = sourceValue;
/* Non-compliant: different essential type category */
enableFlag = sourceValue;
/* Compliant */
if (sourceValue <= UINT8_MAX)
{
smallValue = (uint8_t)sourceValue;
}

enableFlag = (sourceValue != 0U);

}
```

**Notes:** Assignment to a narrower or different essential type category may lose information or change the intended interpretation of the value.

## C-046 | Safety | misra

**Description:** Both operands of an operator in which the usual arithmetic conversions are performed shall have the same essential type category.

**Rationale:** Refer to Ref. [2] Rule 10.4

**MISRA:** 10.4

**Example:**

```c
#include <stdint.h>

void processOperands(void)
{
int32_t  signedValue    = 10;
int32_t  signedOffset   = 2;
uint32_t unsignedValue  = 10U;
uint32_t unsignedOffset = 2U;
int32_t  signedResult   = 0;
uint32_t unsignedResult = 0U;

/* Non-compliant different essential categories are mixed */
signedResult = signedValue + unsignedValue;
/* Compliant: both operands are signed */
signedResult = signedValue + signedOffset;
/* Compliant: both operands are unsigned */
unsignedResult = unsignedValue + unsignedOffset;

}
```

**Notes:** Mixing different essential type categories in arithmetic expressions may produce unexpected conversion results.

## C-047 | Safety | misra

**Description:** The value of a composite expression shall not be assigned to an object with wider essential type.

**Rationale:** Refer to Ref. [2] Rule 10.6

**MISRA:** 10.6

**Example:**

```c
void updateValue(void)
{
   uint16_t valueA = 1U;
   uint16_t valueB = 2U;
   uint32_t resultValue = 0U;

/* Non-compliant */
/* Composite expression has narrower essential type */
   resultValue = valueA + valueB;

/* Compliant */
/* Operands are widened before forming the expression */
   resultValue = (uint32_t)valueA + (uint32_t)valueB;

}
```

**Notes:** Assigning a composite expression to a wider essential type may conceal earlier type-related issues in the expression.

## C-048 | Safety | misra

**Description:** If a composite expression is used as one operand of an operator in which the usual arithmetic conversions are performed then the other operand shall not have wider essential type.

**Rationale:** Refer to Ref. [2] Rule 10.7

**MISRA:** 10.7

**Example:**

```c
void processValue(void)
{
   uint16_t valueA = 1U;
   uint16_t valueB = 2U;
   uint32_t wideValue = 3U;
   uint32_t resultValue = 0U;

/* Non-compliant: composite expression is combined with an operand of wider essential type */
   resultValue = (valueA + valueB) + wideValue;

/* Compliant: both operands of the operator have the same essential type width */
   resultValue = ( (uint32_t)valueA + (uint32_t)valueB )
+ wideValue;

}
```

**Notes:** Using a wider operand together with a composite expression may introduce unexpected implicit conversions.

## C-049 | Safety | misra

**Description:** The value of a composite expression shall not be cast to a different essential type category or a wider essential type.

**Rationale:** Refer to Ref. [2] Rule 10.8

**MISRA:** 10.8

**Example:**

```c
#include <stdint.h>

void processCast(void)
{
uint16_t valueA = 1U;
uint16_t valueB = 2U;
uint32_t resultValue = 0U;

/* Non-compliant */
/* Composite expression is cast to a wider essential type */
resultValue = (uint32_t)(valueA + valueB);

/* Compliant */
/* Operands converted before composite expression formed */
resultValue = (uint32_t)valueA + (uint32_t)valueB;

}
```

**Notes:** Casting a composite expression to a different essential type category or a wider essential type may hide loss of precision or type interpretation issues.

## C-050 | Safety | misra

**Secondary class:** Portability

**Description:** Conversions shall not be performed between a pointer to a function and any other type.

**Rationale:** Refer to Ref. [2] Rule 11.1

**MISRA:** 11.1

**Example:**

```c
#include <stdint.h>

static void processData(void)
{
   /* Do nothing */
}

/* Non-compliant: function pointer converted to an object pointer type */
static void *addressNonCompliant = (void *)processData;

/* Compliant: function pointer remains a function pointer */
static void (*addressCompliant)(void) = processData;

void usePointer(void)
{
   addressCompliant();
}
```

**Notes:** Conversions between function pointers and other types are non-portable and may result in undefined or unsafe behavior.

## C-051 | Safety | misra

**Secondary class:** Portability

**Description:** Conversions shall not be performed between a pointer to an incomplete type and any other type.

**Rationale:** Refer to Ref. [2] Rule 11.2

**MISRA:** 11.2

**Example:**

```c
#include <stdint.h>

typedef struct DeviceTag DeviceType;

void nonCompliantExample(DeviceType *devicePtr)
{
/* Non-compliant */
/* Pointer to incomplete type is converted to another pointer type */
uint32_t *dataPtr = (uint32_t *)devicePtr;
(void)dataPtr;
}

DeviceType *compliantExample(DeviceType *devicePtr)
{
/* Compliant: no conversion is performed */
DeviceType *copyPtr = devicePtr;
return copyPtr;
}
```

**Notes:** Such conversions are non-transparent and may lead to unsafe or non-portable behavior.

## C-052 | Safety | misra

**Secondary class:** Portability

**Description:** A conversion shall not be performed between a pointer to object type and a pointer to a different object type.

**Rationale:** Refer to Ref. [2] Rule 11.3

**MISRA:** 11.3

**Example:**

```c
#include <stdint.h>

void processPointer(void)
{
   uint32_t dataValue = 0U;
   uint32_t *sourcePtr = &dataValue;

/* Non-compliant: pointer to object type is converted to a different object pointer type */
   uint16_t *narrowPtr = (uint16_t *)sourcePtr;

/* Compliant: pointer is assigned only to the same object pointer type */
   uint32_t *sameTypePtr = sourcePtr;

}
```

**Notes:** Converting between unrelated object pointer types may violate type assumptions and cause undefined behavior.

## C-053 | Safety | misra

**Secondary class:** Portability

**Description:** A conversion shall not be performed between a pointer to object and an arithmetic type.

**Rationale:** Refer to Ref. [2] Rule 11.4

**MISRA:** 11.4

**Example:**

```c
#include <stdint.h>

void processPointerConversion(void)
{
   uint32_t dataValue = 0U;
   uint32_t *dataPtr = &dataValue;
   uintptr_t addressValue = 0U;

/* Non-compliant */
/* Pointer to object is converted to an arithmetic type */
   addressValue = (uintptr_t)dataPtr;

/* Non-compliant */
/* Arithmetic type is converted to a pointer to object */
   dataPtr = (uint32_t *)addressValue;

/* Compliant: object pointer is used without conversion */
   dataPtr = &dataValue;
   addressValue = 0U;
```

**Notes:** Pointer–integer conversions are implementation-dependent and shall be avoided except where explicitly justified by the target environment.

## C-054 | Safety | misra

**Secondary class:** Portability

**Description:** A cast shall not be performed between pointer to void and an arithmetic type.

**Rationale:** Refer to Ref. [2] Rule 11.6

**MISRA:** 11.6

**Example:**

```c
#include <stdint.h>

void processVoidPointerConversion(void)
{
   uint32_t dataValue = 0U;
   void *dataPtr = &dataValue;
   uintptr_t addressValue = 0U;

/* Non-compliant */
/* Pointer to void is cast to an arithmetic type */
   addressValue = (uintptr_t)dataPtr;

/* Non-compliant */
/* Arithmetic type is cast to pointer to void */
   dataPtr = (void *)addressValue;

/* Compliant */
/* Pointer to void is used without arithmetic conversion */
   dataPtr = &dataValue;
   addressValue = 0U;

}
```

**Notes:** Such casts reduce portability and may break assumptions about address representation.

## C-055 | Safety | misra

**Secondary class:** Maintainability

**Description:** A conversion shall not remove any const, volatile or _Atomic qualification from the type pointed to by a pointer.

**Rationale:** Refer to Ref. [2] Rule 11.8

**MISRA:** 11.8

**Example:**

```c
#include <stdint.h>

void processQualifiedPointer(void)
{
   const uint32_t dataValue = 1U;
   const uint32_t *sourcePtr = &dataValue;

/* Non-compliant */
/* Const qualification is removed by conversion */
   uint32_t *nonCompliantPtr = (uint32_t *)sourcePtr;
 
/* Compliant: qualification is preserved */
   const uint32_t *compliantPtr = sourcePtr;

}
```

**Notes:** Removing qualifiers may bypass intended access restrictions and invalidate design assumptions.

## C-056 | Consistency and Convention | misra

**Secondary class:** Safety

**Description:** The macro NULL shall be the only permitted form of integer null pointer constant.

**Rationale:** Refer to Ref. [2] Rule 11.9

**MISRA:** 11.9

**Example:**

```c
#include <stdint.h>

void processNullPointer(void)
{
   uint32_t *dataPtr = NULL;

/* Non-compliant */
/* Integer literal 0 is used as a null pointer constant */
   dataPtr = 0;

/* Compliant */
/* NULL macro is used as the null pointer constant */
   dataPtr = NULL;
}
```

**Notes:** A single null-pointer representation improves consistency and readability.

## C-057 | Readability | misra

**Secondary class:** Safety

**Description:** Pointers shall not be implicitly compared to NULL.

**Rationale:** Refer to Ref. [2] Rule 11.11

**MISRA:** 11.11

**Example:**

```c
#include <stdint.h>

void processPointer(uint32_t *dataPtr)
{
/* Non-compliant: pointer is implicitly compared to NULL */
   if (dataPtr)
   {
      *dataPtr = 1U;
   }

/* Compliant: pointer is explicitly compared to NULL */
   if (dataPtr != NULL)
   {
      *dataPtr = 2U;
   }
}
```

**Notes:** Explicit comparison improves readability and makes pointer intent clear during review.

## C-058 | Readability | misra

**Secondary class:** Maintainability

**Description:** The precedence of operators within expressions shall be made explicit.

**Rationale:** Refer to Ref. [2] Rule 12.1

**MISRA:** 12.1

**Example:**

```c
#include <stdint.h>

void processExpression(void)
{
   uint32_t valueA = 1U;
   uint32_t valueB = 2U;
   uint32_t valueC = 3U;
   uint32_t resultValue = 0U;

/* Non-compliant: operator precedence not made explicit */
   resultValue = valueA + valueB * valueC;

/* Compliant */
/* Operator precedence is made explicit with parentheses */
   resultValue = valueA + (valueB * valueC);

}
```

**Notes:** Explicit grouping with parentheses reduces ambiguity and review errors.

## C-059 | Safety | misra

**Description:** The right hand operand of a shift operator shall lie in the range zero to one less than the width in bits of the essential type of the left hand operand.

**Rationale:** Refer to Ref. [2] Rule 12.2

**MISRA:** 12.2

**Example:**

```c
#include <stdint.h>

void processShiftOperation(void)
{
   uint32_t value       = 1U;
   uint32_t resultValue = 0U;
   uint32_t shiftCount  = 32U;

/* Non-compliant */
/* Shift count is not less than the bit-width of uint32_t */
   resultValue = value << shiftCount;

/* Compliant */
/* Shift count is within the valid range 0 to 31 */
   shiftCount = 3U;
   resultValue = value << shiftCount;

}
```

**Notes:** Out-of-range shift counts may cause undefined or implementation-dependent behavior.

## C-060 | Readability | misra

**Secondary class:** Maintainability

**Description:** The comma operator shall not be used.

**Rationale:** Refer to Ref. [2] Rule 12.3

**MISRA:** 12.3

**Example:**

```c
#include <stdint.h>

void processCommaOperator(void)
{
uint32_t valueA = 0U;
uint32_t valueB = 0U;
uint32_t resultValue = 0U;

/* Non-compliant: comma operator is used */
resultValue = (valueA = 1U, valueB = 2U);

/* Compliant: operations written as separate statements */
valueA = 1U;
valueB = 2U;
resultValue = valueB;

}
```

**Notes:** The comma operator obscures intent and reduces readability.

## C-061 | Safety | misra

**Secondary class:** Portability

**Description:** The sizeof operator shall not have an operand which is a function parameter declared as “array of type”.

**Rationale:** Refer to Ref. [2] Rule 12.5

**MISRA:** 12.5

**Example:**

```c
#include <stddef.h>

size_t processArrayParamNonCompliant(uint32_t dataArray[10])
{
/* Non-compliant: arr parameter adjusted to pointer type */
   return sizeof(dataArray);
}

size_t processArrayParamCompliant(const uint32_t *dataPtr,
                                  size_t dataSize)
{
   size_t index = 0U;
   uint32_t sum = 0U;

/* Compliant: actual size is passed explicitly */
   for (index = 0U; index < dataSize; ++index)
   {
      sum += dataPtr[index];
   }

   return dataSize;
}
```

**Notes:** Such parameters are adjusted to pointers, which may mislead the developer about the actual size being evaluated.

## C-062 | Safety | misra

**Description:** The value of an expression and its persistent side effects shall be the same under all permitted evaluation orders and shall be independent from thread interleaving.

**Rationale:** Refer to Ref. [2] Rule 13.2

**MISRA:** 13.2

**Example:**

```c
#include <stdint.h>

void processEvaluationOrder(void)
{
   uint32_t indexValue  = 0U;
   uint32_t resultValue = 0U;

/* Non-compliant */
/* Expression depends on evaluation order of side effects */
   resultValue = indexValue++ + indexValue;

/* Compliant */
/* Side effects are separated into distinct statements */
   indexValue = 0U;
   resultValue = indexValue;
   indexValue = indexValue + 1U;
   resultValue = resultValue + indexValue;

}
```

**Notes:** Expressions shall not rely on unspecified evaluation order or concurrent side-effect interactions.

## C-063 | Readability | misra

**Secondary class:** Safety

**Description:** A full expression containing an increment (++) or decrement (--) operator shall have no other potential side effects other than that caused by the increment or decrement operator.

**Rationale:** Refer to Ref. [2] Rule 13.3

**MISRA:** 13.3

**Example:**

```c
#include <stdint.h>

void processIncrementExpression(void)
{
   uint32_t value = 0U;
   uint32_t resultValue = 0U;

/* Non-compliant */
/* Expression contains ++ and another side effect */
   resultValue = value++ + (value = 10U);

/* Compliant: increment side effect is isolated */
   value = 0U;
   resultValue = value;
   value++;

}
```

**Notes:** Restricting side effects in such expressions improves clarity and prevents subtle evaluation-order issues.

## C-064 | Readability | misra

**Secondary class:** Maintainability

**Description:** The result of an assignment operator shall not be used.

**Rationale:** Refer to Ref. [2] Rule 13.4

**MISRA:** 13.4

**Example:**

```c
#include <stdint.h>

void processAssignmentResult(void)
{
   uint32_t value = 0U;
   bool status = false;
/* Non-compliant: result of assignment is used */
   if ((value = 1U) != 0U)
   {
      status = true;
   }
/* Compliant: assignment and decision are separated */
   value = 1U;
   if (value != 0U)
   {
      status = true;
   }
}
```

**Notes:** Using assignment results inside larger expressions reduces readability and may hide defects.

## C-065 | Safety | misra

**Description:** The right hand operand of a logical && or || operator shall not contain persistent side effects.

**Rationale:** Refer to Ref. [2] Rule 13.5

**MISRA:** 13.5

**Example:**

```c
#include <stdint.h>

void processLogicalOperator(void)
{
   bool statusA = true;
   bool statusB = false;
   uint32_t value = 0U;
/* Non-compliant: rightop contains persistent side effect */
   if (statusA && ((value = 1U) != 0U))
   {
      statusB = true;
   }
/* Compliant: side effect separated from logic expression */
   value = 1U;

   if (statusA && (value != 0U))
   {
      statusB = true;
   }
}
```

**Notes:** Short-circuit evaluation may suppress side effects and create control-flow-dependent behavior.

## C-066 | Safety | misra

**Description:** The operand of the sizeof operator shall not contain any expression which has potential side effects.

**Rationale:** Refer to Ref. [2] Rule 13.6

**MISRA:** 13.6

**Example:**

```c
#include <stdint.h>

void processSizeofOperand(void)
{
   uint32_t dataArray[4] = { 0U, 0U, 0U, 0U };
   uint32_t indexValue   = 0U;
   size_t   sizeValue    = 0U;

/* Non-compliant: sizeof operand contains side effect */
   sizeValue = sizeof(dataArray[indexValue++]);

/* Compliant: sizeof operand has no side effect */
   sizeValue = sizeof(dataArray[0]);
}
```

**Notes:** Side effects inside sizeof operands are misleading because the operand is not normally evaluated.

## C-067 | Safety | misra

**Secondary class:** Maintainability

**Description:** The software shall not use floating-point data types or constants and operations.

**Rationale:** Refer to Ref. [2] Rule 14.1

**MISRA:** 14.1

**Example:**

```c
#include <stdint.h> +

/* Non-compliant */
/* Uses floating-point type and floating-point operation */
float calculateSpeed(float distanceKm, float timeHour)
{
   return distanceKm / timeHour;
}

/* Compliant: uses integer arithmetic only */
uint32_t calculateSpeedKMpH(uint32_t distanceKm, uint32_t timeHour)
{
   uint32_t speedKMpH = 0U;

   if (timeHour != 0U)
   {
      speedKMpH = distanceKm / timeHour;
   }

   return speedKMpH;
}
```

**Notes:** The project shall target a CPU that does not provide an FPU. Therefore, the additional math library is prevented from being used.

## C-068 | Maintainability | misra

**Secondary class:** Readability

**Description:** A for loop shall be well-formed.

**Rationale:** Refer to Ref. [2] Rule 14.2

**MISRA:** 14.2

**Example:**

```c
#include <stdint.h>

void processForLoop(void)
{
   uint32_t sumValue = 0U;
   uint32_t indexValue = 0U;
   uint32_t stepValue = 1U;
/* Non-compliant: loop control modified in the loop body */
   for (indexValue = 0U; indexValue < 10U; indexValue++)
   {
      indexValue = indexValue + stepValue;
      sumValue   = sumValue + indexValue;
   }
/* Compliant */
/* Loop control is defined only in the for statement */
   for (indexValue = 0U; indexValue < 10U; indexValue++)
   {
      sumValue = sumValue + indexValue;
   }
}
```

**Notes:** A well-formed for loop improves analyzability, readability, and predictability of iteration behavior.

## C-069 | Safety | misra

**Description:** Controlling expressions shall not be invariant.

**Rationale:** Refer to Ref. [2] Rule 14.3

**MISRA:** 14.3

**Example:**

```c
#include <stdint.h>

void processInvariantCondition(void)
{
   uint32_t value = 0U;
   bool status = false;
/* Non-compliant: controlling expression is invariant */
   while (true)
{
      value = value + 1U;
      break;
   }
/* Compliant: controlling expression depend on loop state */
   while (value < 10U)
{
      value = value + 1U;
   }
   if (value == 10U){
      status = true;
   }
}
```

**Notes:** Invariant controlling expressions may create unintended infinite loops or unreachable branches.

## C-070 | Safety | misra

**Secondary class:** Readability

**Description:** The controlling expression of an if statement and the controlling expression of an iteration-statement shall have essentially Boolean type.

**Rationale:** Refer to Ref. [2] Rule 14.4

**MISRA:** 14.4

**Example:**

```c
#include <stdint.h>

void processControlExpression(void)
{
   uint32_t value = 1U;
   bool status = false;
/* Non-compliant */
/* Controlling expression not have essentially Boole type */
   if (value)
   {
      status = true;
   }
/* Compliant */
/* Controlling expression has essentially Boolean type */
   if (value != 0U)
   {
      status = true;
   }
}
```

**Notes:** Boolean controlling expressions make decisions explicit and reduce implicit-conversion issues.

## C-071 | Maintainability | misra

**Secondary class:** Readability

**Description:** The goto statement shall not be used.

**Rationale:** Refer to Ref. [2] Rule 15.1

**MISRA:** 15.1

**Example:**

```c
#include <stdint.h>

void processGoto(void)
{
   uint32_t value = 0U;
/* Non-compliant: goto is used */
goto exitLabel;
   value = 1U;
exitLabel:
   value = value + 1U;
/* Compliant: structured control flow is used */
   value = 0U;
   if (value == 0U)
   {
      value = value + 1U;
   }
}
```

**Notes:** goto complicates control flow and makes code more difficult to analyze and maintain.

## C-072 | Maintainability | misra

**Secondary class:** Readability

**Description:** A function shall have a single point of exit at the end.

**Rationale:** Refer to Ref. [2] Rule 15.5

**MISRA:** 15.5

**Example:**

```c
#include <stdint.h>

uint32_t getValueNonCompliant(bool status)
{
/* Non-compliant: multiple exit points are used */
   if (status == true)
{
      return 1U;
   }
   return 0U;
}

uint32_t getValueCompliant(bool status)
{
   uint32_t resultValue = 0U;
/* Compliant: single exit point at the end */
   if (status == true)
{
      resultValue = 1U;
   }
   return resultValue;
}
```

**Notes:** A single exit point simplifies review, tracing, and control-flow analysis.

## C-073 | Readability | misra

**Secondary class:** Safety

**Description:** The body of an iteration-statement or a selection-statement shall be a compound-statement.

**Rationale:** Refer to Ref. [2] Rule 15.6

**MISRA:** 15.6

**Example:**

```c
#include <stdint.h>

void processCompoundStatement(bool status)
{
   uint32_t value = 0U;

/* Non-compliant: if body is not a compound statement */
   if (status == true)
{
      value = 1U;
   }
/* Compliant: if body is a compound statement */
   if (status == true)
   {
      value = 2U;
   }
}
```

**Notes:** Mandatory braces prevent accidental misbinding and improve readability during maintenance.

## C-074 | Maintainability | misra

**Secondary class:** Safety

**Description:** All switch statements shall be well-formed.

**Rationale:** Refer to Ref. [2] Rule 16.1

**MISRA:** 16.1

**Example:**

```c
#include <stdint.h>

void processSwitchWellFormed(uint32_t selectValue)
{
   uint32_t resultValue = 0U;
/* Non-compliant */
/* Statement exists outside any switch-clause */
   switch (selectValue)
   {
      resultValue = 1U;
   case 0U:
      resultValue = 2U;
   break;

   default:
      resultValue = 3U;
   break;
   }
/* Compliant: all statements are inside switch-clauses */
   switch (selectValue)
   {
   case 0U:
      resultValue = 4U;
   break;

   default:
      resultValue = 5U;
   break;
   }
}
```

**Notes:** Well-formed switch constructs improve analyzability and reduce fall-through-related defects.

## C-075 | Safety | misra

**Secondary class:** Maintainability

**Description:** A switch label shall only be used when the most closely-enclosing compound statement is the body of a switch statement.

**Rationale:** Refer to Ref. [2] Rule 16.2

**MISRA:** 16.2

**Example:**

```c
#include <stdint.h>

void processSwitchLabel(uint32_t selectValue)
{
   uint32_t resultValue = 0U;
   switch (selectValue)
{
/* Non-compliant */
/* Case label is placed inside nested compound statement */
   {
   case 0U:
      resultValue = 1U;
      break;
   }
/* Compliant */
/* Case label is placed directly in the switch body */
   case 1U:
      resultValue = 2U;
      break;
   default:
      resultValue = 3U;
      break;
   }
}
```

**Notes:** This restriction preserves proper control-flow structure and prevents misleading label placement.

## C-076 | Safety | misra

**Secondary class:** Readability

**Description:** Every switch-clause shall be appropriately terminated.

**Rationale:** Refer to Ref. [2] Rule 16.3

**MISRA:** 16.3

**Example:**

```c
#include <stdint.h>

void processSwitchTermination(uint32_t selectValue)
{
   uint32_t resultValue = 0U;
   switch (selectValue)
   {
/* Non-compliant: switch-clause is not terminated */
   case 0U:
      resultValue = 1U;
/* Compliant: switch-clause is terminated with break */
   case 1U:
      resultValue = 2U;
      break;
   }
}
```

**Notes:** Proper termination prevents unintended fall-through and clarifies control flow.

## C-077 | Safety | misra

**Secondary class:** Maintainability

**Description:** Every switch statement shall have a default label.

**Rationale:** Refer to Ref. [2] Rule 16.4

**MISRA:** 16.4

**Example:**

```c
#include <stdint.h>

void processSwitchDefault(uint32_t selectValue)
{
   uint32_t resultValue = 0U;

/* Non-compliant: switch has no default label */
   switch (selectValue)
{
      case 0U:
         resultValue = 1U;
         break;
case 1U:
         resultValue = 2U;
         break;
}
/* Compliant: switch has a default label */
   switch (selectValue)
{
      case 0U:
         resultValue = 3U;
         break;
default:
         resultValue = 4U;
         break;
   }
}
```

**Notes:** A default label ensures that unexpected values are handled explicitly.

## C-078 | Maintainability | misra

**Secondary class:** Readability

**Description:** Every switch statement shall have at least two switch-clauses.

**Rationale:** Refer to Ref. [2] Rule 16.6

**MISRA:** 16.6

**Example:**

```c
#include <stdint.h>

void processSwitchClauseCount(uint32_t selectValue)
{
   uint32_t resultValue = 0U;
/* Non-compliant: has only one switch-clause */
   switch (selectValue)
{
   default:
      resultValue = 1U;
      break;
   }
/* Compliant: switch has at least two switch-clauses */
   switch (selectValue)
{
   case 0U:
      resultValue = 2U;
      break;
default:
      resultValue = 3U;
      break;
}
}
```

**Notes:** Very small switch statements are often clearer when expressed using simpler control constructs.

## C-079 | Safety | misra

**Description:** A switch-expression shall not have essentially Boolean type.

**Rationale:** Refer to Ref. [2] Rule 16.7

**MISRA:** 16.7

**Example:**

```c
#include <stdint.h>

void processBooleanSwitch(bool status)
{
   uint32_t resultValue = 0U;
/* Non-compliant */
/* Switch-expression has essentially Boolean type */
   switch (status)
   {
   case false:
      resultValue = 1U;
      break;
   default:
      resultValue = 2U;
      break;
   }
/* Compliant: Boolean decision is expressed with if */
   if (status == true)
   {
      resultValue = 3U;
   }
   else
   {
      resultValue = 4U;
   }
}
```

**Notes:** Boolean decisions are generally clearer and safer when expressed using if statements.

## C-080 | Safety | misra

**Secondary class:** Maintainability

**Description:** Functions shall not call themselves, either directly or indirectly.

**Rationale:** Refer to Ref. [2] Rule 17.2

**MISRA:** 17.2

**Example:**

```c
#include <stdint.h>

uint32_t countDownNonCompliant(uint32_t value)
{
/* Non-compliant: direct recursive call is used */
   if (value > 0U)
{
      return countDownNonCompliant(value - 1U);
   }

/* Rule.72: Multiple return is non-compliant */
   return 0U; 
}
uint32_t countDownCompliant(uint32_t value)
{
/* Compliant: iteration is used instead of recursion */
   while (value > 0U)
{
      value = value - 1U;
   }
   return value;
}
```

**Notes:** Recursion complicates stack usage analysis and may be unsuitable for constrained embedded systems.

## C-081 | Safety | misra

**Secondary class:** Consistency and Convention

**Description:** A function shall not be declared implicitly.

**Rationale:** Refer to Ref. [2] Rule 17.3

**MISRA:** 17.3

**Example:**

```c
#include <stdint.h>

#if 0
void processImplicitDeclaration(void)
{
uint32_t resultValue = 0U;

/* Non-compliant: function used without a declaration */
resultValue = getValue(1U);
}
#endif

/* Compliant: function is declared before use */
uint32_t getValue(uint32_t inputValue);

uint32_t processExplicitDeclaration(void)
{
return getValue(1U);
}

uint32_t getValue(uint32_t inputValue)
{
return inputValue + 1U;
}
```

**Notes:** A function shall be declared before it is used so that the compiler can perform proper type checking and interface validation.

## C-082 | Safety | misra

**Secondary class:** Maintainability

**Description:** All exit paths from a function with non-void return type shall have an explicit return statement with an expression.

**Rationale:** Refer to Ref. [2] Rule 17.4

**MISRA:** 17.4

**Example:**

```c
#include <stdint.h>
#include <stdbool.h>
#include <stdint.h>

uint32_t getStatusNonCompliant(bool status)
{
/* Non-compliant */
/* One exit path has no explicit return expression */
if (status == true)
{
return 1U;
}
}
uint32_t getStatusCompliant(bool status)
{
uint32_t returnValue = 0U;

/* Compliant */
/* All exit paths assign an explicit return value */
if (status == true)
{
returnValue = 1U;
}
else
{
returnValue = 0U;
}
return returnValue;
}
```

**Notes:** Every return path shall make the returned value explicit and reviewable.

## C-083 | Safety | misra

**Secondary class:** Maintainability

**Description:** The function argument corresponding to a parameter declared to have an array type shall have an appropriate number of elements.

**Rationale:** Refer to Ref. [2] Rule 17.5

**MISRA:** 17.5

**Example:**

```c
#include <stdint.h>

void processArray(uint32_t dataArray[4])
{
   uint32_t indexValue = 0U;
for (indexValue = 0U; indexValue < 4U; indexValue++)
{
      dataArray[indexValue] = indexValue;
   }
}
void callProcessArray(void)
{
   uint32_t smallArray[2] = { 0U, 0U };
   uint32_t validArray[4] = { 0U, 0U, 0U, 0U };

/* Non-compliant: argument has too few elements */
   processArray(smallArray);
/* Compliant: Arg has the required number of elements */
   processArray(validArray);
}
```

**Notes:** Insufficient array size may cause out-of-bounds access or interface misuse.

## C-084 | Safety | misra

**Secondary class:** Maintainability

**Description:** The value returned by a function having non-void return type shall be used.

**Rationale:** Refer to Ref. [2] Rule 17.7

**MISRA:** 17.7

**Example:**

```c
#include <stdint.h>

uint32_t getErrorCode(void)
{
   return 1U;
}
void processReturnValue(void)
{
   uint32_t errorCode = 0U;
   bool status = false;
/* Non-compliant: return value is ignored */
   getErrorCode();
/* Compliant: return value is used */
   errorCode = getErrorCode();
   if (errorCode != 0U)
   {
      status = true;
   }
}
```

**Notes:** Ignoring a return value may discard status, diagnostic, or computed information required by the design.

## C-085 | Maintainability | misra

**Secondary class:** Safety

**Description:** A function parameter shall not be modified.

**Rationale:** Refer to Ref. [2] Rule 17.8

**MISRA:** 17.8

**Example:**

```c
#include <stdint.h>

uint32_t updateValueNonCompliant(uint32_t inputValue)
{
/* Non-compliant: function parameter is modified */
   inputValue = inputValue + 1U;

   return inputValue;
}

uint32_t updateValueCompliant(uint32_t inputValue)
{
   uint32_t resultValue = 0U;

/* Compliant: parameter is not modified directly */
   resultValue = inputValue + 1U;

   return resultValue;
}
```

**Notes:** Modifying parameters may obscure data flow and reduce interface clarity.

## C-086 | Consistency and Convention | misra

**Secondary class:** Readability

**Description:** A function identifier shall only be used with either a preceding &, or with a parenthesized parameter list.

**Rationale:** Refer to Ref. [2] Rule 17.12

**MISRA:** 17.12

**Example:**

```c
#include <stdint.h>

void processData(void){}

void useFunctionIdentifier(void)
{
   void (*handlerPtr)(void) = (void *)0;

/* Non-compliant */
/* Function identifier is used without or parameter list */
   handlerPtr = processData;

/* Compliant */
/* Function identifier is used with preceding & */
   handlerPtr = &processData;

/* Compliant */
/* Function identifier is used with a parameter list */
   processData();
}
```

**Notes:** Restricting function identifier usage reduces ambiguity between function designators and calls.

## C-087 | Safety | misra

**Description:** A pointer resulting from arithmetic on a pointer operand shall address an element of the same array as that pointer operand.

**Rationale:** Refer to Ref. [2] Rule 18.1

**MISRA:** 18.1

**Example:**

```c
#include <stdint.h>

void processPointerArithmetic(void)
{
   uint32_t dataArray[2] = { 0U, 1U };
   uint32_t *dataPtr = &dataArray[0];

/* Non-compliant */
/* Resulting pointer does not address an element of the same array */
   dataPtr = dataPtr + 3;

/* Compliant */
/* Resulting pointer addresses an element of same array */
   dataPtr = &dataArray[0];
   dataPtr = dataPtr + 1;
}
```

**Notes:** Pointer arithmetic outside the bounds of the same array may result in undefined behavior.

## C-088 | Safety | misra

**Description:** Subtraction between pointers shall only be applied to pointers that address elements of the same array.

**Rationale:** Refer to Ref. [2] Rule 18.2

**MISRA:** 18.2

**Example:**

```c
#include <stdint.h>

void processPointerSubtraction(void)
{
   uint32_t firstArray[3] = { 0U, 1U, 2U };
   uint32_t secondArray[3] = { 3U, 4U, 5U };
   ptrdiff_t distanceValue = 0;

/* Non-compliant: pointers refer to different arrays */
   distanceValue = &firstArray[2] - &secondArray[0];

/* Compliant: pointers refer to the same array */
   distanceValue = &firstArray[2] - &firstArray[0];
}
```

**Notes:** Pointer subtraction is only meaningful and defined within the same array object.

## C-089 | Safety | misra

**Description:** The relational operators >, >=, < and <= shall not be applied to expressions of pointer type except where they point into the same object.

**Rationale:** Refer to Ref. [2] Rule 18.3

**MISRA:** 18.3

**Example:**

```c
#include <stdint.h>

void processPointerRelation(void)
{
   uint32_t firstArray[2] = { 0U, 1U };
   uint32_t secondArray[2] = { 2U, 3U };
   bool status = false;
/* Non-compliant */
/* Relational comparison is applied to pointers to different arrays */
   if (&firstArray[0] < &secondArray[0])
{
      status = true;
   }
/* Compliant */
/* Relational comparison is applied to pointers within the same array */
   if (&firstArray[0] < &firstArray[1])
{
      status = true;
   }
}
```

**Notes:** Relational comparison of unrelated pointers is not portable and may be undefined.

## C-090 | Readability | misra

**Secondary class:** Safety

**Description:** The +, -, += and -= operators shall not be applied to an expression of pointer type.

**Rationale:** Refer to Ref. [2] Rule 18.4

**MISRA:** 18.4

**Example:**

```c
#include <stdint.h>

void processPointerOperator(void)
{
   uint32_t dataArray[3] = { 10U, 20U, 30U };
   uint32_t *dataPtr = &dataArray[0];
   uint32_t indexValue = 0U;
   uint32_t resultValue = 0U;
/* Non-compliant: pointer arithmetic operator is used */
   dataPtr = dataPtr + 1;
   resultValue = *dataPtr;
/* Compliant */
/* Indexing is used instead of pointer arithmetic */
   indexValue = 1U;
   resultValue = dataArray[indexValue];
}
```

**Notes:** Avoiding pointer arithmetic improves readability and reduces address-manipulation errors.

## C-091 | Readability | misra

**Secondary class:** Maintainability

**Description:** Declarations shall contain no more than two levels of pointer nesting.

**Rationale:** Refer to Ref. [2] Rule 18.5

**MISRA:** 18.5

**Example:**

```c
#include <stdint.h>

void processPointerNesting(void)
{
   uint32_t value = 0U;
   uint32_t *ptrLevel1 = &value;
   uint32_t **ptrLevel2 = &ptrLevel1;

/* Non-compliant: more than 2 levels of pointer nesting */
   uint32_t ***ptrLevel3 = &ptrLevel2;
/* Compliant: pointer nesting is limited to two levels */
   uint32_t **ptrCompliant = &ptrLevel1;
}
```

**Notes:** Deep pointer nesting reduces readability and makes interfaces harder to understand and verify.

## C-092 | Safety | misra

**Description:** The address of an object with automatic or thread-local storage shall not be copied to another object that persists after the first object has ceased to exist.

**Rationale:** Refer to Ref. [2] Rule 18.6

**MISRA:** 18.6

**Example:**

```c
#include <stdint.h>

static uint32_t *storedPtr = (uint32_t *)0;
void setPointerNonCompliant(void)
{
   uint32_t localValue = 0U;

/* Non-compliant */
/* Address of automatic object is copied to persistent object */
   storedPtr = &localValue;
}

static uint32_t persistentValue = 0U;
void setPointerCompliant(void)
{
/* Compliant: address of persistent object is copied */
   storedPtr = &persistentValue;
}
```

**Notes:** Such copies create dangling references and may cause invalid memory access.

## C-093 | Safety | misra

**Secondary class:** Portability

**Description:** Flexible array members shall not be declared.

**Rationale:** Refer to Ref. [2] Rule 18.7

**MISRA:** 18.7

**Example:**

```c
#include <stdint.h>

typedef struct
{
   uint32_t length;
/* Non-compliant: flexible array member is declared */
   uint8_t data[];
}BufferNonCompliantType;

typedef struct
{
   uint32_t length;
/* Compliant: fixed-size array member is declared */
   uint8_t data[8];
}BufferCompliantType;
```

**Notes:** Flexible array members complicate size analysis and may reduce portability.

## C-094 | Safety | misra

**Secondary class:** Portability

**Description:** Variable-length arrays shall not be used.

**Rationale:** Refer to Ref. [2] Rule 18.8

**MISRA:** 18.8

**Example:**

```c
#include <stdint.h>

void processArrayLength(uint32_t length)
{
/* Non-compliant: variable-length array is used */
   uint32_t dataArrayNonCompliant[length];

/* Compliant: fixed-size array is used */
   uint32_t dataArrayCompliant[8];
}
```

**Notes:** Variable-length arrays complicate memory analysis and may introduce stack-usage uncertainty.

## C-095 | Safety | misra

**Description:** An object with temporary lifetime shall not undergo array-to-pointer conversion.

**Rationale:** Refer to Ref. [2] Rule 18.9

**MISRA:** 18.9

**Example:**

```c
#include <stdint.h>

typedef struct
{
   uint32_t data[2];
}BufferType;

static BufferType getBuffer(void)
{
   BufferType buffer = { { 1U, 2U } };
   return buffer;
}
void processTemporaryArray(void)
{
   uint32_t sourceArray[2] = { 1U, 2U };
   uint32_t *dataPtr = (uint32_t *)0;

/* Non-compliant */
/* Array member of a temporary object undergoes array-to-pointer conversion */
   dataPtr = getBuffer().data;
/* Compliant */
/* Array-to-pointer conversion is applied to an object with valid storage duration */
   dataPtr = sourceArray;
}
```

**Notes:** Using pointers derived from temporary objects may result in invalid references.

## C-096 | Safety | misra

**Secondary class:** Portability

**Description:** Pointers to variably-modified array types shall not be used.

**Rationale:** Refer to Ref. [2] Rule 18.10

**MISRA:** 18.10

**Example:**

```c
#include <stdint.h>

void processArrayPointer(uint32_t length)
{
   uint32_t fixedArray[4] = { 0U, 0U, 0U, 0U };

/* Non-compliant */
/* Pointer to variably-modified array type is used */
   uint32_t (*ptrNonCompliant)[length]
= (uint32_t (*)[length])0;

/* Compliant */
/* Pointer to fixed-size array type is used */
   uint32_t (*ptrCompliant)[4] = &fixedArray;
}
```

**Notes:** Such pointers reduce portability and complicate static analysis.

## C-097 | Safety | misra

**Description:** An object shall not be assigned or copied to an overlapping object.

**Rationale:** Refer to Ref. [2] Rule 19.1

**MISRA:** 19.1

**Example:**

```c
#include <stdint.h>

void processOverlappingCopy(void)
{
uint32_t dataArray[4] = { 1U, 2U, 3U, 4U };
uint32_t tempArray[2] = { 0U, 0U };
uint32_t index = 0U;

/* Non-compliant: source and destination overlap */
for (index = 0U; index < 2U; ++index)
{
dataArray[index + 1U] = dataArray[index];
}

/* Compliant: copy a temporary non-overlapping object */
for (index = 0U; index < 2U; ++index)
{
tempArray[index] = dataArray[index];
}

for (index = 0U; index < 2U; ++index)
{
dataArray[index + 1U] = tempArray[index];
}
}
```

**Notes:** Copying between overlapping objects may produce unexpected results and corrupt data.

## C-098 | Maintainability | misra

**Secondary class:** Safety

**Description:** The union keyword shall not be used.

**Rationale:** Refer to Ref. [2] Rule 19.2

**MISRA:** 19.2

**Example:**

```c
#include <stdint.h>

/* Non-compliant: union is used */
typedef union
{
   uint32_t rawValue;
   uint8_t bytes[4];
} DataNonCompliantType;

/* Compliant: structure is used instead */
typedef struct
{
   uint32_t rawValue;
   uint8_t firstByte;
   uint8_t secondByte;
   uint8_t thirdByte;
   uint8_t fourthByte;
}DataCompliantType;
```

**Notes:** Unions may obscure the active stored type and complicate interpretation, portability, and verification.

## C-099 | Consistency and Convention | misra

**Secondary class:** Readability

**Description:** #include directives shall only be preceded by preprocessor directives or comments.

**Rationale:** Refer to Ref. [2] Rule 20.1

**MISRA:** 20.1

**Example:**

```c
/* Non-compliant */
/* file: File_NonCompliant.c */

#include <stdint.h>
uint32_t globalValue = 0U;
#include "file1.h"

/* Compliant */
/* file: File_Compliant.c */
#include <stdint.h>
#include "file1.h"

uint32_t globalValueCompliant = 0U;
```

**Notes:** This keeps preprocessing structure consistent and easier to review.

## C-100 | Portability | misra

**Secondary class:** Readability

**Description:** The ', " or \ characters and the /* or // character sequences shall not occur in a header file name.

**Rationale:** Refer to Ref. [2] Rule 20.2

**MISRA:** 20.2

**Example:**

```c
/* Non-compliant */
#if 0
/* Header file name contains a forbidden character */
#include "my'header.h"
#endif

/* Compliant */
/* Header file name contains only permitted characters */
#include "my_header.h"
```

**Notes:** Restricting header file names avoids preprocessing ambiguity and improves portability.

## C-101 | Consistency and Convention | misra

**Secondary class:** Portability

**Description:** The #include directive shall be followed by either a <filename> or "filename" sequence.

**Rationale:** Refer to Ref. [2] Rule 20.3

**MISRA:** 20.3

**Example:**

```c
/* Non-compliant */
#include file1.h

/* Compliant */
#include "file1.h"
#include <stdint.h>
```

**Notes:** This restriction avoids preprocessing ambiguity and keeps include usage consistent and portable.

## C-102 | Consistency and Convention | misra

**Secondary class:** Safety

**Description:** A macro shall not be defined with the same name as a keyword.

**Rationale:** Refer to Ref. [2] Rule 20.4

**MISRA:** 20.4

**Example:**

```c
/* Non-compliant */
#define for 10U

/* Compliant */
#define loopCountMax 10U
```

**Notes:** Using a keyword as a macro name may break readability and interfere with language syntax expectations.

## C-103 | Safety | misra

**Secondary class:** Readability

**Description:** Expressions resulting from the expansion of macro parameters shall be appropriately delimited.

**Rationale:** Refer to Ref. [2] Rule 20.7

**MISRA:** 20.7

**Example:**

```c
/* Non-compliant */
/* Macro parameters are not appropriately delimited */
#define SQUARE_NONCOMPLIANT(x) x * x

/* Compliant */
/* Macro parameters and full expression are delimited */
#define SQUARE_COMPLIANT(x) ((x) * (x))

void processMacroExpansion(void){
   uint32_t resultNonCompliant = 0U;
   uint32_t resultCompliant = 0U;

   resultNonCompliant = SQUARE_NONCOMPLIANT(1U + 2U);
   resultCompliant    = SQUARE_COMPLIANT(1U + 2U);
}
```

**Notes:** Proper delimiting of macro expansions helps prevent unintended operator precedence and evaluation issues.

## C-104 | Safety | misra

**Secondary class:** Portability

**Description:** The controlling expression of a #if or #elif preprocessing directive shall evaluate to 0 or 1.

**Rationale:** Refer to Ref. [2] Rule 20.8

**MISRA:** 20.8

**Example:**

```c
/* Non-compliant */
#define FEATURE_LEVEL 2
#if FEATURE_LEVEL
#endif
/* Compliant */
#define FEATURE_ENABLED 1
#if (FEATURE_ENABLED == 1)
#endif
```

**Notes:** Restricting preprocessing conditions to 0 or 1 improves clarity and avoids toolchain-dependent interpretations.

## C-105 | Safety | misra

**Secondary class:** Maintainability

**Description:** All identifiers used in the controlling expression of #if or #elif preprocessing directives shall be #define‘d before evaluation.

**Rationale:** Refer to Ref. [2] Rule 20.9

**MISRA:** 20.9

**Example:**

```c
/* Non-compliant */
#if FEATURE_ENABLED
#endif
/* Compliant */
#define FEATURE_ENABLED 1
#if (FEATURE_ENABLED == 1)
#endif
```

**Notes:** Undefined identifiers in preprocessing expressions may lead to misleading or unintended conditional compilation.

## C-106 | Consistency and Convention | misra

**Secondary class:** Maintainability

**Description:** A line whose first token is # shall be a valid preprocessing directive.

**Rationale:** Refer to Ref. [2] Rule 20.13

**MISRA:** 20.13

**Example:**

```c
/* Non-compliant */
#invalid_directive
/* Compliant */
#define bufferSize 8U
```

**Notes:** Any line beginning with # shall be syntactically valid to avoid preprocessing ambiguity and build-time defects.

## C-107 | Maintainability | misra

**Secondary class:** Consistency and Convention

**Description:** All #else, #elif and #endif preprocessor directives shall reside in the same file as the #if, #ifdef or #ifndef directive to which they are related.

**Rationale:** Refer to Ref. [2] Rule 20.14

**MISRA:** 20.14

**Example:**

```c
/* Non-compliant */
file1.h
#if (FEATURE_ENABLED == 1)
#include "file2.h"
file2.h
#endif
/* Compliant */
file1.h
#if (FEATURE_ENABLED == 1)
#include "file2.h"
#endif
```

**Notes:** Preprocessor condition blocks shall remain within the same file to preserve structural clarity and maintainability.
