//! Sending email is a block (agreed 8 Nov): on this Mac, the mail catcher in the database stack
//! (Mailpit), which keeps every email and sends none; hosted, a sending service picked then. Here, a
//! small SMTP client for a sender on this machine or a private network: plain text, no login, no
//! TLS. An address never appears in an error, a log line or the record.
use super::{Error, Result};
use std::time::Duration;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
    time::timeout,
};
use url::Url;

/// One plain-text email.
#[derive(Debug, Clone)]
pub struct Mail {
    pub to: String,
    pub subject: String,
    pub body: String,
}

/// Where email goes. `None` refuses to send, so whatever needs an email says it isn't set up.
#[derive(Debug, Clone)]
pub enum Mailer {
    None,
    Smtp {
        /// host:port of the SMTP server.
        server: String,
        /// The From header, such as `No Origins <no-reply@no-origins.localhost>`.
        from: String,
    },
}

impl Mailer {
    /// From a setting such as smtp://127.0.0.1:55325; no setting, no email.
    pub fn from_setting(url: Option<&Url>, from: &str) -> Result<Self> {
        let Some(url) = url else {
            return Ok(Mailer::None);
        };
        if url.scheme() != "smtp" || !url.username().is_empty() || url.password().is_some() {
            return Err(Error::Invalid(
                "the mail setting is smtp://host:port, with no login".into(),
            ));
        }
        let host = url
            .host_str()
            .ok_or_else(|| Error::Invalid("the mail setting needs a host".into()))?;
        let port = url.port().unwrap_or(25);
        if address_of(from).is_none() {
            return Err(Error::Invalid(
                "the sender is an address, or Name <address>".into(),
            ));
        }
        Ok(Mailer::Smtp {
            server: format!("{host}:{port}"),
            from: from.to_string(),
        })
    }

    pub async fn send(&self, mail: &Mail) -> Result<()> {
        let Mailer::Smtp { server, from } = self else {
            return Err(Error::Mail("email is not set up on this Governance".into()));
        };
        if mail.to.contains(['\r', '\n', '<', '>']) || mail.subject.contains(['\r', '\n']) {
            return Err(Error::Mail(
                "an address or subject that cannot be sent".into(),
            ));
        }
        timeout(Duration::from_secs(10), smtp(server, from, mail))
            .await
            .map_err(|_| Error::Mail("the mail server did not answer in time".into()))?
    }
}

/// The address inside "Name <address>", or the whole of a bare address.
fn address_of(from: &str) -> Option<&str> {
    let address = match (from.find('<'), from.rfind('>')) {
        (Some(a), Some(b)) if a < b => &from[a + 1..b],
        (None, None) => from.trim(),
        _ => return None,
    };
    (address.contains('@') && !address.contains([' ', '\r', '\n'])).then_some(address)
}

async fn smtp(server: &str, from: &str, mail: &Mail) -> Result<()> {
    let failed = |what: &str| Error::Mail(format!("the mail server said no: {what}"));
    let stream = TcpStream::connect(server)
        .await
        .map_err(|_| Error::Mail("the mail server is not answering".into()))?;
    let (read, mut write) = stream.into_split();
    let mut read = BufReader::new(read);
    // Reads one reply, however many lines, and checks its code.
    async fn reply(read: &mut BufReader<tokio::net::tcp::OwnedReadHalf>, ok: &[&str]) -> bool {
        loop {
            let mut line = String::new();
            match read.read_line(&mut line).await {
                Ok(0) | Err(_) => return false,
                Ok(_) => {}
            }
            if line.len() < 4 {
                return false;
            }
            if line.as_bytes()[3] == b'-' {
                continue;
            }
            return ok.iter().any(|code| line.starts_with(code));
        }
    }
    let sender = address_of(from).ok_or_else(|| failed("the sender"))?;
    if !reply(&mut read, &["220"]).await {
        return Err(failed("greeting"));
    }
    let hello = sender.rsplit('@').next().unwrap_or("localhost");
    for (command, ok, what) in [
        (format!("EHLO {hello}\r\n"), &["250"][..], "hello"),
        (format!("MAIL FROM:<{sender}>\r\n"), &["250"][..], "sender"),
        (
            format!("RCPT TO:<{}>\r\n", mail.to),
            &["250", "251"][..],
            "recipient",
        ),
        ("DATA\r\n".to_string(), &["354"][..], "data"),
    ] {
        write
            .write_all(command.as_bytes())
            .await
            .map_err(|_| failed(what))?;
        if !reply(&mut read, ok).await {
            return Err(failed(what));
        }
    }
    let date = chrono::Utc::now().to_rfc2822();
    let mut message = format!(
        "From: {from}\r\nTo: <{}>\r\nSubject: {}\r\nDate: {date}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n",
        mail.to, mail.subject
    );
    for line in mail.body.replace("\r\n", "\n").split('\n') {
        // A line that starts with a dot gets another, so it can't end the message early.
        if line.starts_with('.') {
            message.push('.');
        }
        message.push_str(line);
        message.push_str("\r\n");
    }
    message.push_str(".\r\n");
    write
        .write_all(message.as_bytes())
        .await
        .map_err(|_| failed("message"))?;
    if !reply(&mut read, &["250"]).await {
        return Err(failed("message"));
    }
    let _ = write.write_all(b"QUIT\r\n").await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_sender_is_an_address_or_a_name_with_one() {
        assert_eq!(
            address_of("No Origins <no-reply@x.test>"),
            Some("no-reply@x.test")
        );
        assert_eq!(address_of("no-reply@x.test"), Some("no-reply@x.test"));
        assert_eq!(address_of("No Origins"), None);
        assert_eq!(address_of("a <b@c"), None);
    }

    /// Against a real mail server, such as the catcher on this Mac:
    /// NOI_TEST_SMTP=smtp://127.0.0.1:55325 cargo test -p noi-gov --features server -- --ignored sends
    /// CI runs every ignored test and has no mail server, so without the setting it skips; the
    /// database tests send through a stand-in server either way (found 9 Nov).
    #[tokio::test]
    #[ignore = "sends only when NOI_TEST_SMTP names a mail server"]
    async fn sends_to_a_real_mail_server() {
        let Ok(setting) = std::env::var("NOI_TEST_SMTP") else {
            eprintln!(
                "skipped: set NOI_TEST_SMTP to a mail server, such as smtp://127.0.0.1:55325"
            );
            return;
        };
        let url = Url::parse(&setting).unwrap();
        let mailer =
            Mailer::from_setting(Some(&url), "No Origins <no-reply@no-origins.localhost>").unwrap();
        mailer
            .send(&Mail {
                to: "test@example.com".into(),
                subject: "Governance's mail test".into(),
                body: "A line.\n.A line that starts with a dot.\nThe end.".into(),
            })
            .await
            .unwrap();
    }

    #[test]
    fn the_setting_is_smtp_with_no_login() {
        let from = "No Origins <no-reply@x.test>";
        assert!(matches!(Mailer::from_setting(None, from), Ok(Mailer::None)));
        let ok = Url::parse("smtp://127.0.0.1:55325").unwrap();
        assert!(
            matches!(Mailer::from_setting(Some(&ok), from), Ok(Mailer::Smtp { server, .. }) if server == "127.0.0.1:55325")
        );
        for bad in ["http://127.0.0.1:55325", "smtp://user:pw@127.0.0.1:25"] {
            assert!(Mailer::from_setting(Some(&Url::parse(bad).unwrap()), from).is_err());
        }
        assert!(Mailer::from_setting(Some(&ok), "nobody").is_err());
    }
}
