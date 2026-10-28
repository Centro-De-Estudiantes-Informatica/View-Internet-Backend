## ADDED Requirements

### Requirement: Inicio de sesión por cédula
El sistema SHALL autenticar a una persona con su cédula y contraseña, y SHALL devolver un token de acceso (JWT) con su `id` y su `rol`. La cédula MUST aceptarse con o sin puntos, guiones o prefijo (`V`, `E`).

#### Scenario: Credenciales válidas
- **WHEN** una persona activa envía `V-28.123.456` y su contraseña correcta a `POST /auth/login`
- **THEN** el sistema responde 200 con un token de acceso, su rol y el indicador `mustChangePassword`

#### Scenario: Cédula en otro formato
- **WHEN** la misma persona envía `28123456` como cédula
- **THEN** el sistema la identifica como la misma cuenta

#### Scenario: Credenciales inválidas
- **WHEN** la contraseña no coincide o la cédula no existe
- **THEN** el sistema responde 401 con un mensaje genérico que no revela cuál de los dos datos falló

#### Scenario: Cuenta desactivada
- **WHEN** una persona con cuenta desactivada intenta iniciar sesión
- **THEN** el sistema responde 403 y no emite token

### Requirement: Cambio de contraseña obligatorio en el primer ingreso
El sistema SHALL marcar con `mustChangePassword = true` toda cuenta creada o restablecida por un administrador y MUST rechazar cualquier operación distinta de `POST /auth/change-password` mientras esa marca esté activa.

#### Scenario: Primer ingreso
- **WHEN** un estudiante con contraseña temporal inicia sesión e intenta consultar `GET /me/status`
- **THEN** el sistema responde 403 con el código `PASSWORD_CHANGE_REQUIRED`

#### Scenario: Cambio exitoso
- **WHEN** el estudiante envía su contraseña temporal y una nueva contraseña de al menos 8 caracteres
- **THEN** el sistema guarda el nuevo hash, desactiva la marca y emite un token nuevo

### Requirement: Autorización por rol
El sistema SHALL exigir un token válido en todos los endpoints excepto `POST /auth/login`, y MUST restringir los endpoints de administración al rol `ADMIN`.

#### Scenario: Estudiante intenta una ruta de administrador
- **WHEN** un token con rol `ESTUDIANTE` llama a `GET /users`
- **THEN** el sistema responde 403

#### Scenario: Rol cambiado después de emitir el token
- **WHEN** a un administrador le quitan el rol y luego usa su token anterior en una ruta de administrador
- **THEN** el sistema verifica el rol vigente en la base de datos y responde 403

### Requirement: Protección contra fuerza bruta
El sistema SHALL limitar los intentos de inicio de sesión fallidos por cédula y por IP.

#### Scenario: Demasiados intentos
- **WHEN** se registran 5 intentos fallidos para la misma cédula en 15 minutos
- **THEN** el sistema responde 429 a los siguientes intentos hasta que pase la ventana
