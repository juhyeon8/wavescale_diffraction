# diffractionmetal

용어: 화면 표기는 '하위헌스-프레넬'로 통일하고, 코드 식별자와 폴더명은 `huygens`를 그대로 유지합니다.

## 배포

Vercel이 Root Directory를 `dist/`로 잡고 **빌드 스텝 없이 정적 서빙**합니다. 따라서 `dist/`는 중간 산출물이 아니라 배포되는 실체이며, **git 추적 대상입니다 — `.gitignore`에 넣지 마세요.**

소스를 고쳐도 `dist/`에 반영해 커밋하기 전까지는 배포본에 나가지 않습니다. HTML·CSS는 그대로 복사하고, JS는 `javascript-obfuscator`로 재빌드합니다.

```
javascript-obfuscator <src>.js --output dist/<src>.js \
  --string-array false --control-flow-flattening false --self-defending false
```

세 플래그는 고정입니다. MoM 핫루프에 회귀가 생기는 것을 막기 위한 것이니 임의로 바꾸지 마세요.
