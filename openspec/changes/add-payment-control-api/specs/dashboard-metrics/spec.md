## ADDED Requirements

### Requirement: Resumen del periodo
El sistema SHALL ofrecer a los `ADMIN` un resumen del periodo con: recaudado por moneda en su monto original y su equivalente en USD, total equivalente en USD, esperado (estudiantes activos × cuota), porcentaje cobrado, cantidad de estudiantes por estado y cantidad de pagos `EN_REVISION`. Solo cuentan los pagos `APROBADO`.

#### Scenario: Resumen de octubre
- **WHEN** un administrador consulta `GET /metrics/summary?periodo=2026-10`
- **THEN** recibe los totales por moneda (`USD`, `VES`, `COP`), el total en USD, el esperado, el conteo por estado y los pagos por revisar

#### Scenario: Pagos anulados o rechazados
- **WHEN** existen pagos `ANULADO` o `RECHAZADO` en el periodo
- **THEN** no suman en ningún total del resumen

### Requirement: Serie mensual de ingresos
El sistema SHALL devolver el recaudado equivalente en USD de los últimos N periodos (por defecto 6) para graficar la tendencia.

#### Scenario: Últimos seis meses
- **WHEN** un administrador consulta `GET /metrics/monthly?months=6`
- **THEN** recibe seis entradas ordenadas de la más antigua a la más reciente, con 0 en los meses sin pagos

### Requirement: Últimos movimientos
El sistema SHALL devolver los últimos pagos aprobados con estudiante, método, moneda y monto.

#### Scenario: Últimos pagos
- **WHEN** un administrador consulta `GET /metrics/recent?limit=10`
- **THEN** recibe hasta 10 pagos aprobados, del más reciente al más antiguo
