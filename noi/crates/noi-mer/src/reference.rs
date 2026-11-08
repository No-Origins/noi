//! Reference records stay proposed. Seeding never pretends to release the architecture.
use super::*;
use std::collections::HashMap;
fn proposal(
    path: &str,
    name: &str,
    kind: MeronType,
    subtype: &str,
    definition: &str,
    responsibility: &str,
    scope: Option<Uuid>,
) -> NewMeron {
    NewMeron {
        path: path.into(),
        name: name.into(),
        classification: Classification {
            kind,
            subtype: Some(subtype.into()),
            roles: vec![],
        },
        semantics: Semantics {
            definition: definition.into(),
            responsibility: responsibility.into(),
        },
        release_mode: if path == "noi" {
            ReleaseMode::Independent
        } else {
            ReleaseMode::Inherited
        },
        authority_scope: scope,
        metadata: json!({"specification_status":"provisional","source_review":"IR-001","reference_seed":"v1"}),
        spec: json!({}),
    }
}
pub fn proposals(root: Option<Uuid>) -> Vec<NewMeron> {
    vec![
        proposal("noi","No Origins Infrastructure",MeronType::System,"infrastructure","The umbrella over every No Origins system","Provide shared infrastructure for evolving product experiences.",None),
        proposal("noi.inv","Invariants",MeronType::System,"foundational-domain","The rules every meron must always pass","Define identity, classification, relationships, lifecycle and compatibility invariants.",root),
        proposal("noi.gov","Governance",MeronType::System,"foundational-domain","Identity, roles and permissions for people and agents","Resolve permissions, policies and approvals independently from Invariants validation.",root),
    ]
}
impl Registry {
    /// Atomic and repeatable; incompatible existing definitions cause rollback.
    pub async fn seed_reference(&self, actor: &Actor) -> Result<Snapshot> {
        let mut tx = self.write().await?;
        let mut ids = HashMap::new();
        for i in 0..proposals(None).len() {
            let root = ids.get("noi").copied();
            let p = proposals(root).remove(i);
            let meron = match resolve(tx.as_mut(), &p.path).await {
                Ok(e) => {
                    self.authorize(
                        actor,
                        Action::Read,
                        vec![resource(&e)],
                        json!({"operation":"seed-check"}),
                    )
                    .await?;
                    if e.identity.path != p.path
                        || e.identity.name != p.name
                        || e.classification != p.classification
                        || e.semantics != p.semantics
                        || e.metadata != p.metadata
                        || e.spec != p.spec
                        || e.lifecycle.release_mode != p.release_mode
                        || e.authority_scope != root.unwrap_or(e.identity.uid)
                    {
                        return Err(ValidationError(format!(
                            "reference seed conflicts with existing definition: {}",
                            p.path
                        ))
                        .into());
                    }
                    e
                }
                Err(Error::NotFound) => self.propose_in(tx.as_mut(), actor, p).await?,
                Err(e) => return Err(e),
            };
            ids.insert(meron.identity.path.clone(), meron.identity.uid);
        }
        for (s, p, t) in [
            ("noi", Predicate::Contains, "noi.inv"),
            ("noi", Predicate::Contains, "noi.gov"),
            ("noi.inv", Predicate::GovernedBy, "noi.gov"),
            ("noi", Predicate::GovernedBy, "noi.gov"),
        ] {
            let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mer.relationships WHERE source=$1 AND predicate=$2 AND target=$3)").bind(ids[s]).bind(p.as_str()).bind(ids[t]).fetch_one(tx.as_mut()).await?;
            if !exists {
                self.relate_in(tx.as_mut(), actor, ids[s], p, ids[t])
                    .await?;
            }
        }
        tx.commit().await?;
        self.snapshot(actor).await
    }
}
