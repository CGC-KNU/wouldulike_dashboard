# 백엔드 변경사항 (wouldulike_backend에 적용)

## 1. dashboard 앱 추가

`wouldulike_backend/` 루트에 `dashboard/` 폴더 복사:
```
wouldulike_backend/
└── dashboard/          ← 이 폴더 통째로 복사
    ├── apps.py
    ├── models.py
    ├── views.py
    └── urls.py
```

## 2. settings.py 수정

`INSTALLED_APPS`에 추가:
```python
INSTALLED_APPS = [
    ...
    "dashboard",      # ← 추가
]
```

## 3. wouldulike_backend/urls.py 수정

```python
urlpatterns = [
    ...
    path("api/dashboard/", include("dashboard.urls")),   # ← 추가
]
```

## 4. accounts/views.py 수정 — 카카오 로그인 응답에 is_owner 추가

카카오 로그인 성공 시 응답에 `is_owner` 필드를 추가해야 함:

```python
# 카카오 로그인 뷰의 응답 부분에 추가
from dashboard.models import OwnerProfile

is_owner = OwnerProfile.objects.filter(user=user, is_active=True).exists()

return Response({
    "access": str(refresh.access_token),
    "refresh": str(refresh),
    "is_owner": is_owner,    # ← 추가
    ...
})
```

## 5. 마이그레이션

```bash
python manage.py makemigrations dashboard
python manage.py migrate
```

## 6. CORS 설정 (settings.py)

대시보드 도메인 허용:
```python
CORS_ALLOWED_ORIGINS = [
    ...
    "https://your-dashboard.vercel.app",    # ← 추가 (Vercel 도메인)
    "http://localhost:3000",                 # 로컬 개발용
]
```
