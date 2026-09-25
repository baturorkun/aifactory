<!-- superpowers-token-policy:start -->

## Superpowers düşük-token çalışma politikası

Superpowers skill’lerini yalnızca görevle doğrudan ilgili olduklarında kullan.

Öncelik sırası:

1. Doğruluk
2. Düşük token tüketimi
3. Süre

Görevin daha uzun sürmesi kabul edilebilir. Token tüketimini azaltmak için:

- Yalnızca gerekli Superpowers skill’lerini yükle.
- Aynı skill’i veya talimat dosyasını tekrar okuma.
- Kullanıcı açıkça istemedikçe subagent ve paralel agent kullanma.
- Görevi tek agent ile tamamlamayı tercih et.
- Uzun brainstorming oturumlarından kaçın; yalnızca sonucu değiştirecek soruları sor.
- Plan gerekiyorsa kısa, uygulanabilir ve görev kapsamıyla sınırlı tut.
- Gereksiz alternatifler, uzun açıklamalar ve tekrar eden özetler üretme.
- Mevcut dosyaları hedefli biçimde ara; tüm projeyi gereksiz yere okuma.
- Daha önce edinilmiş ve hâlâ geçerli bilgileri yeniden toplama.
- Değişiklikleri mümkün olan en küçük kapsamda tut.
- İlgisiz refactor veya iyileştirme yapma.
- Yalnızca değişiklikle ilgili testleri ve doğrulamaları çalıştır.
- Aynı testi, aramayı veya incelemeyi yeni kanıt olmadan tekrarlama.
- Test çıktılarının yalnızca ilgili bölümlerini incele.
- Kullanıcıya kısa ve seyrek ilerleme güncellemeleri ver.
- Nihai yanıtta yalnızca sonuç, değişen dosyalar ve önemli doğrulama sonuçlarını bildir.

Bir Superpowers skill’i daha fazla token harcatsa bile hata, tekrar çalışma veya yanlış uygulama riskini belirgin biçimde azaltıyorsa kullanılabilir.

<!-- superpowers-token-policy:end -->

## RAG sunucusuna deploy (rsync.sh)

RAG servisi (API + web) `root@192.168.1.2:/srv/aifactory` üzerinde çalışır; sunucudaki kopya git checkout değildir. Kod oraya **yalnızca `./rsync.sh` ile** gider; script'e güvenilir, dosyaları tek tek `scp` ile kopyalama.

- `./rsync.sh` repo'nun tamamını `--delete-delay` ile eşitler (`.git`, `.venv-rag`, `node_modules`, `dist`, `coverage`, `*.log` hariç). Host, kullanıcı ve dizin `AIFACTORY_RSYNC_HOST` / `AIFACTORY_RSYNC_USER` / `AIFACTORY_RSYNC_DIR` ile değiştirilebilir.
- **`.env` de senkronlanır:** yerel `.env` sunucunun kaynağıdır. Sunucuda elle oluşturulan her şey (yedek klasörleri dahil) bir sonraki sync'te silinir.
- **Sync servisi yeniden başlatmaz.** Değişen parçaya göre ardından:
  - RAG servis kodu (`services/rag`) veya `factory.config.json`: `ssh root@192.168.1.2 'systemctl restart aifactory-rag'`
  - Yeni Python bağımlılığı (`services/rag/pyproject.toml`): önce `ssh root@192.168.1.2 '/srv/aifactory/.venv-rag/bin/pip install "<paket>"'`, sonra restart.
  - Web (`services/rag-web/public`): `ssh root@192.168.1.2 'cd /srv/aifactory && docker compose --env-file .env -f infra/rag/compose.yaml up -d --build --no-deps rag-web'`. `--env-file .env` şart: yoksa compose varsayılan `127.0.0.1:8080`'e bağlanmaya çalışır ve web kapanır.
- **Ingest** (yeni dosya tipleri veya dokümanlar için; değişmeyen dosyalar atlanır):
  `ssh root@192.168.1.2 'cd /srv/aifactory && set -a && . ./.env && set +a && PYTHONPATH=services/rag/src .venv-rag/bin/python -m aifactory_rag --config factory.config.json ingest --source <source-id>'`
- **Doğrulama:** `http://192.168.1.2:9090` → "RAG service" kartı. **Build** yereldeki kodun parmak iziyle aynı olmalı:
  `cd services/rag && python3 -c "import sys; sys.path.insert(0,'src'); from aifactory_rag import build_info; print(build_info.capture().build)"`.
  Kart sarıysa ve "restart pending" yazıyorsa kod güncellendi ama servis yeniden başlatılmadı.
