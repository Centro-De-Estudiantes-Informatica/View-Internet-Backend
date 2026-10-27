## ADDED Requirements

### Requirement: Alta de personas por el administrador
El sistema SHALL permitir que un `ADMIN` cree una persona con cédula, nombre completo, teléfono opcional y rol, generando una contraseña temporal. La cédula MUST ser única después de normalizarse (prefijo + dígitos).

#### Scenario: Alta exitosa
- **WHEN** un administrador crea a "José Rodríguez" con cédula `V-30.555.111`
- **THEN** el sistema guarda la cédula normalizada como `V30555111`, devuelve la contraseña temporal una sola vez y marca la cuenta con `mustChangePassword`

#### Scenario: Cédula duplicada
- **WHEN** un administrador intenta crear otra persona con `30555111`
- **THEN** el sistema responde 409 indicando que la cédula ya está registrada

### Requirement: Listado y búsqueda de personas
El sistema SHALL listar personas de forma paginada y SHALL permitir buscarlas por cédula o por nombre. Si el término contiene 3 o más dígitos, la búsqueda MUST compararse contra los dígitos de la cédula; si no, contra el nombre sin distinguir mayúsculas ni acentos. El listado SHALL permitir filtrar por rol y por estado de pago del periodo.

#### Scenario: Buscar por cédula con formato
- **WHEN** un administrador busca `28.123`
- **THEN** el resultado incluye a la persona con cédula `V-28.123.456`

#### Scenario: Buscar por nombre sin acento
- **WHEN** un administrador busca `jose`
- **THEN** el resultado incluye a "José Rodríguez"

#### Scenario: Filtrar pendientes del mes
- **WHEN** un administrador lista con `estado=PENDIENTE&periodo=2026-10`
- **THEN** el sistema devuelve solo las personas cuyo estado calculado para octubre 2026 es `PENDIENTE`

### Requirement: Cambio de rol
El sistema SHALL permitir que un `ADMIN` cambie el rol de otra persona entre `ESTUDIANTE` y `ADMIN`. El sistema MUST impedir que un administrador cambie su propio rol y MUST impedir que el sistema quede sin administradores activos. Cada cambio de rol SHALL registrarse en la auditoría con quién lo hizo y cuándo.

#### Scenario: Promover a administrador
- **WHEN** un administrador cambia el rol de "Ana Gómez" a `ADMIN`
- **THEN** el sistema guarda el cambio y crea un registro de auditoría

#### Scenario: Cambiar el propio rol
- **WHEN** un administrador intenta cambiar su propio rol
- **THEN** el sistema responde 409 con el código `CANNOT_CHANGE_OWN_ROLE`

#### Scenario: Último administrador
- **WHEN** solo queda un administrador activo y alguien intenta quitarle el rol o desactivarlo
- **THEN** el sistema responde 409 con el código `LAST_ADMIN`

### Requirement: Restablecer contraseña y desactivar cuentas
El sistema SHALL permitir que un `ADMIN` restablezca la contraseña de una persona (nueva contraseña temporal con `mustChangePassword`) y que active o desactive su cuenta. Las cuentas desactivadas MUST conservar su historial de pagos.

#### Scenario: Restablecer contraseña
- **WHEN** un administrador restablece la contraseña de un estudiante
- **THEN** el sistema devuelve una contraseña temporal nueva y anula los tokens anteriores de esa persona

#### Scenario: Desactivar estudiante
- **WHEN** un administrador desactiva a un estudiante que ya no asiste
- **THEN** la persona no puede iniciar sesión y deja de contarse en el "esperado" de los periodos siguientes
