## ADDED Requirements

### Requirement: Cuota mensual en USD
El sistema SHALL guardar la cuota mensual en USD y SHALL crear un periodo por mes (`AAAA-MM`) que congele la cuota vigente al abrirse. Cambiar la cuota MUST afectar solo a los periodos que se abran después.

#### Scenario: Apertura automática del periodo
- **WHEN** llega el primer día de noviembre 2026 o se registra el primer pago de ese mes
- **THEN** existe el periodo `2026-11` con la cuota vigente en ese momento

#### Scenario: Cambio de cuota
- **WHEN** un administrador cambia la cuota de $5.00 a $6.00 durante octubre
- **THEN** octubre conserva $5.00 y noviembre se abre con $6.00

### Requirement: Tasas de cambio diarias
El sistema SHALL permitir que un `ADMIN` registre la tasa del día para `VES` (Bs por USD) y `COP` (pesos por USD). La tasa vigente para una fecha MUST ser la última registrada en o antes de esa fecha.

#### Scenario: Registrar tasa
- **WHEN** un administrador registra 200,00 Bs/USD para el 26/10/2026
- **THEN** los pagos en VES de ese día usan esa tasa para calcular su equivalente en USD

#### Scenario: Día sin tasa nueva
- **WHEN** se registra un pago en COP el 27/10/2026 y la última tasa COP es del 24/10/2026
- **THEN** el sistema usa la tasa del 24/10/2026 e informa su fecha en la respuesta

#### Scenario: Sin ninguna tasa
- **WHEN** se intenta registrar un pago en VES sin ninguna tasa VES cargada
- **THEN** el sistema responde 422 con el código `RATE_MISSING`

### Requirement: Cuota expresada en cada moneda
El sistema SHALL exponer la cuota del periodo convertida a VES y COP con la tasa vigente, para que el estudiante sepa cuánto pagar.

#### Scenario: Consultar cuota en bolívares
- **WHEN** un estudiante consulta `GET /billing/current` con cuota $5.00 y tasa 200,00 Bs/USD
- **THEN** la respuesta incluye `VES: 1000.00`, la tasa usada y su fecha
