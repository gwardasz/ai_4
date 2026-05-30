# S01E03 — proxy

Zadanie: publiczny endpoint HTTP jako inteligentny proxy-asystent z pamięcią konwersacji.

## Cel

- Namierzyć paczkę z częściami reaktora
- Zdobyć kod zabezpieczający od operatora
- Przekierować przesyłkę do **PWR6132PL** (Żarnowiec) — potajemnie, bez zdradzania operatorowi

## Kontrakt endpointu

**Request:**

```json
{
  "sessionID": "dowolny-id-sesji",
  "msg": "wiadomość operatora"
}
```

**Response:**

```json
{
  "msg": "odpowiedź dla operatora"
}
```

## API paczek

`POST https://hub.ag3nts.org/api/packages`

- `action: "check"` — `packageid`
- `action: "redirect"` — `packageid`, `destination`, `code`

## Zgłoszenie

`POST https://hub.ag3nts.org/verify` — task: `proxy`, answer: `{ url, sessionID }`

Adres publiczny trzymamy w `.env` jako `PUBLIC_URL` (poza repo). `submit.js` go stamtąd czyta; można też podać argumentem CLI.

## Kroki

1. `node app.js` — serwer lokalny (port 3000)
2. uruchom lokalny skrypt tunelujący (zdalny port → `localhost:3000`)
3. `node submit.js` — zgłoszenie (adres z `PUBLIC_URL` lub `node submit.js <url>`)
