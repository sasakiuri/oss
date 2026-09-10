# AWS resource naming convention v1.2

- Status: Final
- Created: 2026-08-16
- Scope: AWS resources across all repositories
- Rationale: Standardize the `${var.project}-${var.environment}-${var.region_code}` prefix already used in production and resolve variations such as `prod`/`prd` and manually created PascalCase resources
- Examples in this document use `nilay` as the project name

## 1. Basic format

```
{project}-{env}-{region}-{component}[-{qualifier}][-{account_id}]
```

The formal grammar (ABNF) in Appendix A is authoritative for the exact definition.

Examples:

| Resource       | Name                                   |
| -------------- | -------------------------------------- |
| ALB            | `nilay-prd-apne1-alb-app`              |
| EC2 (Name tag) | `nilay-prd-apne1-app`                  |
| RDS            | `nilay-prd-apne1-rds-postgres`         |
| tfstate S3     | `nilay-prd-apne1-tfstate-123456789012` |
| CodeBuild      | `nilay-prd-apne1-build`                |
| IAM role       | `nilay-prd-apne1-ec2-app-role`         |

## 2. Field definitions

### 2.1 project

- **Start with a letter**, followed by lowercase alphanumeric characters (no hyphens; a single token). Regular expression: `^[a-z][a-z0-9]{0,11}$`
- A leading letter is required because RDS DB identifiers must start with a letter, and the full name starts with project
- **Maximum 12 characters; 8 or fewer recommended** (based on the length budget in §4)
- For names longer than 12 characters, define an abbreviation and record the mapping in the README (for example, `nilaycustomerportal` (19 characters) → `nilaycp`)
- Example: `nilay`

### 2.2 env (environment code): exactly 3 characters

| Code  | Meaning                                              |
| ----- | ---------------------------------------------------- |
| `dev` | Development                                          |
| `stg` | Staging                                              |
| `prd` | Production                                           |
| `sbx` | Sandbox / experiments (optional)                     |
| `shr` | Shared infrastructure across environments (optional) |

**Decision**: Use `prd`, not `prod`, to keep the length budget calculation stable at 3 characters. Existing `prod` resources are covered by the grandfathering policy in §7.

### 2.3 region (region code): allowlist management

Region codes are **strictly controlled by the allowlist below**; regular-expression validation alone is insufficient. Add any new region to this table before using it.

| AWS region     | Code    | Length |
| -------------- | ------- | ------ |
| ap-northeast-1 | `apne1` | 5      |
| ap-northeast-3 | `apne3` | 5      |
| ap-southeast-1 | `apse1` | 5      |
| us-east-1      | `use1`  | 4      |
| us-west-2      | `usw2`  | 4      |
| eu-west-1      | `euw1`  | 4      |
| eu-central-1   | `euc1`  | 4      |

- Length varies from 4 to 5 characters. **Calculate the length budget (§4) using the actual code length; do not assume a fixed length**. Use the maximum of 5 for a conservative estimate
- Global services (IAM, CloudFront, Route53, ACM fixed to `us-east-1`, and similar services) also **use the code of the stack's home region unchanged**. Prioritize a uniform prefix for easy searching and simple Terraform implementation over strict geographic accuracy

### 2.4 component

Use standard vocabulary describing the resource's role, in `{service}-{role}` order (for example, `ec2-app`, `rds-postgres`, `alb-app`).

- **Each token must start with a letter** (`[a-z][a-z0-9]*`). Tokens starting with a digit are prohibited to ensure unambiguous parsing (see Appendix A). Put a letter first in terms containing digits (for example, `225labo` → `labo225`)
- Standard vocabulary (drawn from existing resources): `app`, `alb`, `rds-postgres`, `tfstate`, `tfstate-lock`, `build`, `pipeline`, `codedeploy`, `codepipeline-artifact`, `static`, `events`

### 2.5 qualifier (optional)

Add only when multiple resources of the same kind exist. **Must start with a digit and contain 1–2 characters** to ensure unambiguous parsing (see Appendix A):

- Sequence number: `-1` through `-9`, or two digits from `-10` through `-99` (no leading zero)
- AZ suffix: a digit followed by one letter (for example, `-1a`, `-1c`)

### 2.6 account_id

Required for **resources with a global namespace (S3 buckets only)**. Append the 12-digit AWS account ID. Do not add it to other resources.

## 3. Character rules

- **Use lowercase kebab-case for all resources** (`a-z0-9-`). Aligning with S3's lowercase requirement avoids conversions when copying or referencing names across services
- Consecutive hyphens (`--`) and leading or trailing hyphens are prohibited (RDS and ALB restrictions)
- Underscores are prohibited because RDS identifiers do not allow them
- PascalCase, underscores, and dot-separated names (such as the form `Nilay_Portal-Stg-Apne1-CodeBuild`) are prohibited for new resources. Existing resources are covered by §7

### 3.1 Explicit character exceptions (only these three are allowed)

| Exception              | Details                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudWatch Logs        | Log group names are slash-separated paths. Keep `/aws/{service}/{resource-name}` for AWS default groups; use `/{project}/{env}/{component}` for custom groups |
| KMS aliases            | Allow the AWS-required `alias/` prefix: `alias/{prefix}-{purpose}`                                                                                            |
| Route53 / domain names | Dot-separated; governed by domain design and outside the scope of this convention                                                                             |

## 4. Length budget

Use this common formula for name length across all services:

```
name_len = len(project) + 1 + 3 + 1 + len(region) + 1 + len(component)
           [ + 1 + len(qualifier) ]
           [ + 1 + 12 ]              # S3 only (account_id)
```

The strictest limit is **32 characters for ALBs and target groups**.

**Maximum component length** without a qualifier. `prefix_len = len(project) + 1 + 3 + 1 + len(region)` (for example, `nilay-prd-apne1` = 15 characters):

| Resource                  | Name limit | Component limit formula    | Example: project=nilay (5), region=apne1 |
| ------------------------- | ---------- | -------------------------- | ---------------------------------------- |
| ALB / target group        | 32         | `32 - prefix_len - 1`      | 16 characters                            |
| S3 (including account_id) | 63         | `63 - prefix_len - 1 - 13` | 34 characters                            |
| RDS identifier            | 63         | `63 - prefix_len - 1`      | 47 characters                            |
| IAM role                  | 64         | `64 - prefix_len - 1`      | 48 characters                            |
| Lambda                    | 64         | `64 - prefix_len - 1`      | 48 characters                            |
| CodePipeline              | 100        | `100 - prefix_len - 1`     | 84 characters                            |

- Conservative estimates may assume the maximum region length of 5 characters, but **CI validation (§8) must use actual values**
- For ALB/TG only, abbreviating component is allowed when the budget is exceeded (for example, `alb-app` → `alb`). Record the abbreviation mapping in a comment in Terraform locals

## 5. Service-specific rules

**Default rule**: For services not listed below, use `{prefix}-{component}` (in the Name tag if there is no name attribute). A PR introducing a new service type must check its specific length and character restrictions and add a row to this table. Adding it to the names map in §8 enables CI length validation.

| Service                                               | Rule                                                                                                                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3                                                    | `{prefix}-{component}-{account_id}`; account_id is required                                                                                                                         |
| IAM role                                              | `{prefix}-{principal}-{role}-role` (for example, `-ec2-app-role`, `-codepipeline-role`). New roles require the `-role` suffix to distinguish roles, policies, and instance profiles |
| IAM policy                                            | `{prefix}-{target}-policy`                                                                                                                                                          |
| IAM instance profile                                  | Replace `-role` with `-profile` in the corresponding role name                                                                                                                      |
| IAM user                                              | `{prefix}-{purpose}-user` (machine users only; human users are governed by SSO/IdP and are out of scope)                                                                            |
| EC2                                                   | Name tag = `{prefix}-{component}`. Must exactly match CodeDeploy's `ec2_tag_filter`                                                                                                 |
| VPC / Subnet / SG and others without a name attribute | Apply the same rule to the Name tag. Subnets require a qualifier, as in `-public-1a`                                                                                                |
| RDS                                                   | Identifier = `{prefix}-rds-{engine}`. Database names and usernames are outside this naming convention and are managed in application configuration                                  |
| DynamoDB                                              | `{prefix}-{component}`                                                                                                                                                              |
| Lambda                                                | `{prefix}-{function-role}`                                                                                                                                                          |
| ECR                                                   | `{prefix}-{component}` (lowercase is required, so no additional conversion is needed)                                                                                               |
| KMS aliases                                           | `alias/{prefix}-{purpose}` (exception in §3.1)                                                                                                                                      |
| CloudWatch Logs                                       | Follow the exception rules in §3.1                                                                                                                                                  |
| CodeBuild / CodePipeline / CodeDeploy                 | `{prefix}-build` / `{prefix}-pipeline` / `{prefix}-codedeploy`                                                                                                                      |
| SNS                                                   | `{prefix}-{topic-purpose}`                                                                                                                                                          |
| CloudFront / ACM                                      | No name attribute. Use `{prefix}-{component}` in the Name tag                                                                                                                       |
| Route53                                               | Exception in §3.1. Include project in the zone comment                                                                                                                              |

## 6. Tagging rules (supplementing names)

Store information not included in names as tags. Required tags for all resources:

| Tag           | Value                  |
| ------------- | ---------------------- |
| `Project`     | project value          |
| `Environment` | env value              |
| `ManagedBy`   | `terraform` / `manual` |
| `Repository`  | Source repository name |

Apply these centrally through the AWS provider's `default_tags`; specify only the Name tag on individual resources.

## 7. Existing resources (grandfathering)

- **Do not rename existing resources**: services such as S3 and RDS require destructive recreation
- List noncompliant existing resources (`prod` names, manually created PascalCase resources, and irregular legacy names) in an exception register in each repository's Terraform README
- Apply the tags in §6 to exception resources as well, ensuring consistency at the tag level
- Migrate to the new convention when replacing or recreating resources

## 8. Terraform implementation conventions

- Centralize the `name_prefix` definition in **a shared module or a single locals definition per environment**; do not duplicate copies across environments
- Validate region_code against an allowlist map, not just a regular expression

```hcl
locals {
  # Allowlist from §2.3. Add new regions here.
  region_codes = {
    "ap-northeast-1" = "apne1"
    "ap-northeast-3" = "apne3"
    "us-east-1"      = "use1"
  }
  region_code = local.region_codes[var.aws_region] # Unlisted regions fail here.

  name_prefix = "${var.project}-${var.environment}-${local.region_code}"

  # Named resources in this stack. Additions are length-checked by the check below.
  names = {
    alb        = { value = "${local.name_prefix}-alb-app", limit = 32 }
    tg         = { value = "${local.name_prefix}-tg-app", limit = 32 }
    rds        = { value = "${local.name_prefix}-rds-postgres", limit = 63 }
    s3_tfstate = { value = "${local.name_prefix}-tfstate-${local.account_id}", limit = 63 }
    build      = { value = "${local.name_prefix}-build", limit = 255 }
  }
}

variable "project" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9]{0,11}$", var.project))
    error_message = "project must start with a letter, lowercase alphanumeric, max 12 chars"
  }
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "stg", "prd", "sbx", "shr"], var.environment)
    error_message = "environment must be one of: dev, stg, prd, sbx, shr"
  }
}

# Validate all resource name lengths together; do not hardcode individual checks.
check "name_lengths" {
  assert {
    condition = alltrue([
      for k, n in local.names : length(n.value) <= n.limit
    ])
    error_message = "resource name exceeds its service limit; see local.names"
  }
}
```

## 9. Validation

- The service table and default rule in §5 cover the `resource "aws_*"` types found in repository `*.tf` files when this convention was established. Handle new, unlisted services through the default rule and table-update process in §5
- Length limits can be checked mechanically using the formula in §4. Enforce them in CI through `local.names` and the `check` block in §8, using actual values without fixed-length assumptions
- Existing prefix compatibility: §1 uses the same format as `local.name_prefix` in existing Terraform implementations

## Appendix A: Formal grammar (ABNF)

The following RFC 5234 ABNF defines standard resource names. This appendix is authoritative if it conflicts with the body (§1–§5).

```abnf
resource-name = prefix "-" component [ "-" qualifier ] [ "-" account-id ]

prefix        = project "-" env "-" region

project       = LC-ALPHA *11LC-ALNUM   ; 1–12 characters, starts with a letter (§2.1)
env           = "dev" / "stg" / "prd" / "sbx" / "shr"          ; §2.2
region        = "apne1" / "apne3" / "apse1"                    ; §2.3 allowlist
              / "use1" / "usw2" / "euw1" / "euc1"              ; Update both here and §2.3.

component     = token *( "-" token )   ; Must match the standard vocabulary in §2.4 (side condition S1).
qualifier     = ordinal / az           ; §2.5: starts with a digit, 1–2 characters
ordinal       = NZ-DIGIT [ DIGIT ]     ; "1"–"9", "10"–"99"
az            = NZ-DIGIT LC-ALPHA      ; For example, "1a", "1c"
account-id    = 12DIGIT                ; §2.6 (S3 only, side condition S2)

token         = LC-ALPHA *LC-ALNUM     ; Leading letter (§2.4): key to unambiguous parsing
LC-ALPHA      = %x61-7A                ; a-z
NZ-DIGIT      = %x31-39                ; 1-9
LC-ALNUM      = LC-ALPHA / DIGIT
DIGIT         = %x30-39
```

Exception resources from §3.1:

```abnf
kms-alias     = "alias/" prefix "-" component
log-group     = "/aws/" 1*( LC-ALNUM / "-" / "/" )             ; AWS default groups
              / "/" project "/" env "/" component              ; Custom groups
```

### Side conditions (context-dependent, so not expressed in the grammar)

| #   | Condition                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------ |
| S1  | `component` must match the standard vocabulary in §2.4 or a form defined by the service-specific rules in §5 |
| S2  | `account-id` is required for S3 buckets and prohibited for non-S3 resources                                  |
| S3  | Total name length must stay within the service-specific limit (§4)                                           |
| S4  | IAM must follow the suffix rules in §5 (`-role` / `-policy` / `-profile` / `-user`)                          |

### Unambiguous parsing

When a name is split on hyphens, the character patterns for each field are **mutually exclusive**:

| Field                                            | Character pattern                   |
| ------------------------------------------------ | ----------------------------------- |
| Each token in project / env / region / component | Starts with a letter                |
| qualifier                                        | Starts with a digit, 1–2 characters |
| account-id                                       | Exactly 12 digits                   |

The following algorithm therefore produces **a unique parse**:

1. Split on `-`.
2. Take the first three tokens as `project` / `env` / `region`, validating env and region against their closed sets.
3. If the final token is exactly 12 digits, remove it as `account_id`.
4. If the final token starts with a digit and has 1–2 characters, remove it as `qualifier`.
5. All remaining tokens form `component`; verify that each starts with a letter.

Only qualifier and account-id can contain tokens starting with digits, and their lengths (≤2 and exactly 12) distinguish them. No split position therefore admits two interpretations.

### Equivalent regular expression for CI

This expression covers complete standard resource names, including qualifier and account_id. Check side conditions S1/S2 separately. Named groups expose each field directly when a match succeeds:

```
^(?P<project>[a-z][a-z0-9]{0,11})-(?P<env>dev|stg|prd|sbx|shr)-(?P<region>apne1|apne3|apse1|use1|usw2|euw1|euc1)-(?P<component>[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*)(-(?P<qualifier>[1-9][0-9]|[1-9][a-z]|[1-9]))?(-(?P<account_id>[0-9]{12}))?$
```

The grammar cannot produce consecutive, leading, or trailing hyphens (§3): tokens contain at least one character, and hyphens serve only as separators. The mutually exclusive character patterns also make the regular-expression match unambiguous.

## Revision history

| Version    | Date       | Changes                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.0 draft | 2026-08-16 | Initial version. Standardized existing implementations and resolved inconsistencies                                                                                                                                                                                                                                           |
| v1.0 rc1   | 2026-08-16 | Required a leading letter for project, added the region allowlist and actual-length calculations, clarified the S3 budget formula, the default rule in §5, the generalized check block, and explicit exceptions in §3.1                                                                                                       |
| v1.0       | 2026-08-16 | Finalized. Removed specific project names and standardized examples on `nilay`; corrected off-by-one errors in the §4 budget table                                                                                                                                                                                            |
| v1.1       | 2026-08-16 | Added Appendix A (ABNF grammar, side conditions, and CI regular expression) and stated its authority in §1                                                                                                                                                                                                                    |
| v1.2       | 2026-08-16 | Made parsing unambiguous: component tokens must start with a letter; qualifier starts with a digit and has 1–2 characters, extending sequence numbers to 99; account_id is exactly 12 digits. Added the parsing algorithm based on mutually exclusive character patterns and the named-group regular expression to Appendix A |
