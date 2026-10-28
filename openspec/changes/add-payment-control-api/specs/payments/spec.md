## ADDED Requirements

### Requirement: Pagos multimoneda con tasa congelada
Todo pago SHALL guardar la moneda (`USD`, `VES`, `COP`), el monto original, la tasa aplicada, su equivalente en USD (`monto / tasa`, redondeado a 2 decimales) y el periodo que cubre. La tasa MUST quedar congelada en el pago: cambios posteriores de tasa no recalculan pagos existentes. Los montos MUST manejarse como decimales exactos, nunca como punto flotante.

#### Scenario: Pago en bolívares
- **WHEN** se aprueba un pago de Bs 1.000,00 con tasa 200,00
- **THEN** el pago guarda `amountUsd = 5.00` y `rate = 200.00`

#### Scenario: Cambio de tasa posterior
- **WHEN** al día siguiente la tasa sube a 210,00
- **THEN** el pago anterior sigue valiendo $5.00

### Requirement: Registro de pago en efectivo por el administrador
El sistema SHALL permitir que un `ADMIN` registre un pago en efectivo en cualquiera de las tres monedas para un estudiante y un periodo. El pago queda en estado `APROBADO` y guarda quién lo registró.

#### Scenario: Efectivo en USD
- **WHEN** un administrador registra $5.00 en efectivo de "José Rodríguez" para `2026-10`
- **THEN** el pago queda `APROBADO` con `registeredBy` = ese administrador y el estado de José en octubre pasa a `AL_DIA`

#### Scenario: Monto inválido
- **WHEN** el monto es cero o negativo
- **THEN** el sistema responde 422

### Requirement: Reporte de pago móvil por el estudiante
El sistema SHALL permitir que un `ESTUDIANTE` reporte un pago móvil (solo en `VES`) con número de referencia, banco de origen, teléfono de origen, fecha, monto y una captura opcional (JPG/PNG, máximo 5 MB). El pago queda `EN_REVISION`. La combinación banco + referencia MUST ser única entre pagos no rechazados.

#### Scenario: Reporte exitoso
- **WHEN** un estudiante reporta referencia `004512` de Banesco por Bs 1.000,00
- **THEN** el pago queda `EN_REVISION` y aparece en la cola de revisión del administrador

#### Scenario: Referencia duplicada
- **WHEN** otro reporte usa la misma referencia y banco que un pago `EN_REVISION` o `APROBADO`
- **THEN** el sistema responde 409 con el código `DUPLICATE_REFERENCE`

#### Scenario: Pago móvil en otra moneda
- **WHEN** un estudiante intenta reportar un pago móvil en `USD` o `COP`
- **THEN** el sistema responde 422

### Requirement: Revisión de pagos móviles
El sistema SHALL permitir que un `ADMIN` apruebe o rechace un pago `EN_REVISION`. Rechazar MUST exigir un motivo, que el estudiante podrá ver. Solo los pagos `EN_REVISION` pueden revisarse.

#### Scenario: Aprobar
- **WHEN** un administrador aprueba el pago con referencia `004512`
- **THEN** el pago pasa a `APROBADO`, guarda `reviewedBy` y `reviewedAt`, y cuenta para el estado del periodo

#### Scenario: Rechazar
- **WHEN** un administrador rechaza un pago con el motivo "La referencia no aparece en el banco"
- **THEN** el pago pasa a `RECHAZADO` y el estudiante ve el motivo en su historial

#### Scenario: Revisar dos veces
- **WHEN** se intenta aprobar un pago que ya está `APROBADO`
- **THEN** el sistema responde 409

### Requirement: Anulación en lugar de borrado
El sistema MUST NOT borrar pagos. Un `ADMIN` SHALL poder anular un pago aprobado indicando un motivo; el pago pasa a `ANULADO` y deja de contar en estados y métricas.

#### Scenario: Anular pago registrado por error
- **WHEN** un administrador anula un pago con el motivo "Registrado al estudiante equivocado"
- **THEN** el pago queda `ANULADO` con quién y cuándo, y el estado mensual del estudiante se recalcula

### Requirement: Estado mensual calculado
El sistema SHALL calcular el estado de cada estudiante por periodo, sin guardarlo a mano, a partir de la suma de `amountUsd` de sus pagos `APROBADO` frente a la cuota del periodo, con una tolerancia de $0.05 por redondeo: `AL_DIA` si la suma ≥ cuota − tolerancia; `PARCIAL` si la suma > 0; `EN_REVISION` si la suma es 0 y tiene algún pago `EN_REVISION`; `PENDIENTE` en otro caso.

#### Scenario: Al día
- **WHEN** un estudiante tiene $5.00 aprobados en un periodo de cuota $5.00
- **THEN** su estado es `AL_DIA`

#### Scenario: Parcial
- **WHEN** un estudiante tiene Bs 600,00 aprobados con tasa 200,00 ($3.00) en un periodo de cuota $5.00
- **THEN** su estado es `PARCIAL` y el saldo pendiente es $2.00 (Bs 400,00 a la tasa vigente)

#### Scenario: Solo en revisión
- **WHEN** un estudiante no tiene pagos aprobados pero tiene uno `EN_REVISION`
- **THEN** su estado es `EN_REVISION`

### Requirement: Consulta del propio estado e historial
El sistema SHALL permitir que un `ESTUDIANTE` consulte solo su propio estado del periodo actual, los meses que debe y su historial de pagos (incluidos los rechazados con su motivo). Un estudiante MUST NOT poder ver los pagos ni los datos de otra persona.

#### Scenario: Consultar mi estado
- **WHEN** un estudiante llama a `GET /me/status`
- **THEN** recibe el estado del periodo actual, los periodos adeudados y el monto pendiente en USD, VES y COP

#### Scenario: Acceder a otro estudiante
- **WHEN** un estudiante llama a `GET /payments?userId=<otro>`
- **THEN** el sistema responde 403
