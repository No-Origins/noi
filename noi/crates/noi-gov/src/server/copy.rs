//! Governance's own copy of the roles and rules approved in Mero. It is taken after each approval
//! in noi.gov, checked again before it replaces the last one, and kept if Mero is down. Governance
//! decides only from this copy, so it never reads Mero mid-change.
use super::{record, Error, Governance, Result};
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Serialize)]
pub struct Copied {
    pub copy: i64,
    pub roles: usize,
    pub rules: usize,
    /// Grants ended because their role was retired.
    pub ended_grants: u64,
}

/// One role or rule as Mero holds it.
#[derive(Debug, PartialEq)]
struct Held {
    path: String,
    kind: &'static str,
    system: Option<String>,
    cedar: String,
    state: String,
    revision: i64,
}

/// The roles and rules in a Mero snapshot: rule merons under noi.gov that are active or deprecated.
/// Retired ones are left out. Each is checked again, as Invariants checked it before approval.
fn held(snapshot: &Value) -> std::result::Result<Vec<Held>, String> {
    let merons = snapshot["merons"].as_array().ok_or("the snapshot has no merons")?;
    let mut out = vec![];
    for m in merons {
        let path = m["identity"]["path"].as_str().unwrap_or_default();
        if !path.starts_with("noi.gov.") || m["classification"]["type"] != "rule" {
            continue;
        }
        let state = m["lifecycle"]["state"].as_str().unwrap_or_default();
        if !(state == "active" || state == "deprecated") {
            continue;
        }
        let spec = &m["spec"];
        let kind = match m["classification"]["subtype"].as_str() {
            Some("role") => {
                crate::check_role(spec).map_err(|e| format!("{path}: {e}"))?;
                "role"
            }
            Some("policy") => {
                crate::check_rule(spec).map_err(|e| format!("{path}: {e}"))?;
                "rule"
            }
            _ => continue,
        };
        out.push(Held {
            path: path.into(),
            kind,
            system: spec["system"].as_str().map(Into::into),
            cedar: spec["cedar"].as_str().unwrap_or_default().into(),
            state: state.into(),
            revision: m["revision"].as_i64().ok_or_else(|| format!("{path}: no revision"))?,
        });
    }
    Ok(out)
}

impl Governance {
    /// Copies from Mero's read API. If Mero does not answer, the last copy stays and that is recorded.
    pub async fn copy_from_mero(&self) -> Result<Copied> {
        let mero = self
            .config
            .mero
            .clone()
            .ok_or_else(|| Error::Invalid("no Mero address is configured".into()))?;
        // Only the approved roles and rules under noi.gov: the one thing Mero shows without asking.
        let url = mero.join("api/governance/roles-and-rules").expect("a path");
        let fetched = async {
            reqwest::Client::new()
                .get(url.clone())
                .timeout(std::time::Duration::from_secs(10))
                .send()
                .await?
                .error_for_status()?
                .json::<Value>()
                .await
        }
        .await;
        match fetched {
            Ok(snapshot) => self.copy_from_snapshot(&snapshot, url.as_str()).await,
            Err(e) => {
                let mut conn = self.pool.acquire().await?;
                let reason = format!("Mero did not answer, so the last copy stays: {e}");
                record(&mut conn, "copy", None, None, &[], false, &reason, json!({"source": url.as_str()})).await?;
                Err(Error::Mero(reason))
            }
        }
    }

    /// Replaces the copy with the roles and rules in this snapshot, all at once. A snapshot that
    /// fails a check, or holds no roles, is refused and the last copy stays.
    pub async fn copy_from_snapshot(&self, snapshot: &Value, source: &str) -> Result<Copied> {
        let checked = held(snapshot).and_then(|h| {
            if h.iter().any(|x| x.kind == "role") {
                Ok(h)
            } else {
                Err("it holds no roles".into())
            }
        });
        let held = match checked {
            Ok(h) => h,
            Err(why) => {
                let mut conn = self.pool.acquire().await?;
                let reason = format!("the copy was refused, so the last copy stays: {why}");
                record(&mut conn, "copy", None, None, &[], false, &reason, json!({"source": source})).await?;
                return Err(Error::Refused(reason));
            }
        };
        let roles = held.iter().filter(|h| h.kind == "role").count();
        let rules = held.len() - roles;
        let mut tx = self.write().await?;
        let copy: i64 = sqlx::query_scalar("INSERT INTO gov.copies(source, roles, rules) VALUES($1,$2,$3) RETURNING id")
            .bind(source)
            .bind(roles as i32)
            .bind(rules as i32)
            .fetch_one(tx.as_mut())
            .await?;
        sqlx::query("DELETE FROM gov.policies").execute(tx.as_mut()).await?;
        for h in &held {
            sqlx::query("INSERT INTO gov.policies(path,kind,system,cedar,state,revision,copy) VALUES($1,$2,$3,$4,$5,$6,$7)")
                .bind(&h.path)
                .bind(h.kind)
                .bind(&h.system)
                .bind(&h.cedar)
                .bind(&h.state)
                .bind(h.revision)
                .bind(copy)
                .execute(tx.as_mut())
                .await?;
        }
        // Decision 2: retiring a role ends its grants.
        let ended = sqlx::query(
            "UPDATE gov.grants SET ended_at = now(), end_reason = 'role retired'
             WHERE ended_at IS NULL AND role NOT IN (SELECT path FROM gov.policies WHERE kind = 'role')",
        )
        .execute(tx.as_mut())
        .await?
        .rows_affected();
        let paths: Vec<String> = held.iter().map(|h| format!("{}@{}", h.path, h.revision)).collect();
        record(tx.as_mut(), "copy", None, None, &paths, true, "roles and rules copied", json!({"copy": copy, "source": source, "ended_grants": ended})).await?;
        tx.commit().await?;
        Ok(Copied {
            copy,
            roles,
            rules,
            ended_grants: ended,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn meron(path: &str, subtype: &str, state: &str, spec: Value) -> Value {
        json!({"identity": {"path": path}, "classification": {"type": "rule", "subtype": subtype},
               "lifecycle": {"state": state}, "revision": 3, "spec": spec})
    }
    const OWNER: &str = r#"permit (principal == ?principal, action in Action::"governance", resource in ?resource);"#;
    #[test]
    fn only_admitted_roles_and_rules_under_noi_gov_are_copied() {
        let snapshot = json!({"merons": [
            meron("noi.gov.roles.owner", "role", "active", json!({"system": "governance", "cedar": OWNER})),
            meron("noi.gov.roles.old", "role", "deprecated", json!({"system": "governance", "cedar": OWNER})),
            meron("noi.gov.roles.gone", "role", "retired", json!({"system": "governance", "cedar": OWNER})),
            meron("noi.gov.roles.draft", "role", "proposed", json!({"system": "governance", "cedar": OWNER})),
            meron("noi.eio.roles.owner", "role", "active", json!({"system": "governance", "cedar": OWNER})),
            meron("noi.gov.rules.touch", "policy", "active", json!({"cedar": "forbid (principal, action, resource) unless { context.fresh_signature };"})),
        ]});
        let h = held(&snapshot).unwrap();
        let paths: Vec<_> = h.iter().map(|x| (x.path.as_str(), x.kind, x.state.as_str())).collect();
        assert_eq!(paths, [("noi.gov.roles.owner", "role", "active"), ("noi.gov.roles.old", "role", "deprecated"), ("noi.gov.rules.touch", "rule", "active")]);
    }
    #[test]
    fn a_role_that_fails_its_check_refuses_the_whole_copy() {
        let snapshot = json!({"merons": [
            meron("noi.gov.roles.owner", "role", "active", json!({"system": "mero", "cedar": OWNER})),
        ]});
        assert!(held(&snapshot).unwrap_err().contains("not an action mero declares"));
    }
}
