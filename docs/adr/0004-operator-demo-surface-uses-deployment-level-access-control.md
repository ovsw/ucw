# Operator Demo Surface uses deployment-level access control

The first **Operator Demo Surface** is an operator-only MVP interface, not a self-serve **Parent** product or shareable **Parent** view. We will rely on deployment-level access control for the demo environment instead of building app-level authentication in the MVP, because custom auth would add user/account scope before the product requires multiple operators, customer-facing access, or per-user audit needs.
