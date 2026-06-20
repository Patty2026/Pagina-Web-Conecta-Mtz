# Conversión de Conecta Mtz a App Móvil Android

Este documento explica cómo utilizar la página web de Conecta Mtz como base para crear una aplicación móvil Android.

## 1. Opciones para crear la app

### Opción A: WebView en Android Studio
Es la opción más rápida. Consiste en crear una app Android que cargue la página publicada en GitHub Pages dentro de un componente WebView.

URL del sitio:

```txt
https://patty2026.github.io/Pagina-Web-Conecta-Mtz/
```

Ventajas:
- Reutilizar la página web existente.
- Actualizar la app modificando el repositorio web.
- Crear una APK de forma sencilla.
- Mantener una sola base visual.

Limitaciones:
- Depende de internet si no se prepara modo offline.
- Algunas funciones nativas requieren permisos adicionales.

### Opción B: Convertir el proyecto a PWA
Permite instalar la web como aplicación desde el navegador usando un manifiesto web y service worker.

Ventajas:
- Menor complejidad.
- Instalación directa desde Chrome.
- Puede funcionar parcialmente offline.

### Opción C: App nativa con Kotlin o Java
Consiste en reconstruir todas las pantallas usando código Android nativo.

Ventajas:
- Mayor rendimiento.
- Mejor integración con cámara, ubicación, notificaciones y almacenamiento.

Desventajas:
- Requiere más tiempo de desarrollo.
- Se debe reconstruir la interfaz desde cero.

## 2. Recomendación para Conecta Mtz

Para este proyecto se recomienda iniciar con la opción A: WebView.

Esto permite crear una aplicación Android funcional para:

- Ciudadano:
  - Registrarse.
  - Iniciar sesión.
  - Reportar incidencias.
  - Adjuntar imágenes.
  - Consultar estatus.
  - Visualizar historial.

- Administrador:
  - Gestionar usuarios.
  - Validar incidencias.
  - Actualizar estados.
  - Generar seguimiento.
  - Consultar estadísticas.

- Apoyo comunitario:
  - Visualizar incidencias asignadas.
  - Actualizar avance.
  - Dar solución.
  - Cerrar reportes.

## 3. Crear proyecto en Android Studio

1. Abrir Android Studio.
2. Seleccionar `New Project`.
3. Elegir `Empty Views Activity` o `Empty Activity`.
4. Nombre del proyecto: `ConectaMtz`.
5. Lenguaje recomendado: Kotlin.
6. Minimum SDK sugerido: API 23 o superior.

## 4. Permiso de internet

En el archivo `AndroidManifest.xml`, agregar el permiso:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Ejemplo completo:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:usesCleartextTraffic="true"
        android:theme="@style/Theme.ConectaMtz"
        android:label="Conecta Mtz">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>
```

## 5. Layout con WebView

En `activity_main.xml` colocar:

```xml
<?xml version="1.0" encoding="utf-8"?>
<WebView xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/webView"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
```

## 6. Código Kotlin para cargar la página

En `MainActivity.kt` colocar:

```kotlin
package com.example.conectamtz

import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true

        webView.loadUrl("https://patty2026.github.io/Pagina-Web-Conecta-Mtz/")
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
```

## 7. Adjuntar imágenes desde la app

Para permitir subir imágenes desde el formulario web, se debe configurar un selector de archivos en Android usando `WebChromeClient`.

Esto será necesario para que el usuario ciudadano pueda adjuntar evidencias fotográficas de una incidencia.

## 8. Firebase para app móvil

Para que Conecta Mtz funcione como sistema real, se recomienda conectar Firebase:

- Firebase Authentication para registro e inicio de sesión.
- Firestore para guardar incidencias.
- Firebase Storage para imágenes.
- Firebase Cloud Messaging para notificaciones.

## 9. Base de datos sugerida

Colecciones recomendadas en Firestore:

```txt
usuarios
incidencias
seguimientos
apoyo_comunitario
notificaciones
```

### usuarios
Campos sugeridos:

```txt
idUsuario
nombre
correo
rol
telefono
fechaRegistro
estado
```

### incidencias
Campos sugeridos:

```txt
idIncidencia
folio
idCiudadano
categoria
descripcion
ubicacion
imagenUrl
estado
apoyoAsignado
fechaRegistro
fechaActualizacion
```

### seguimientos
Campos sugeridos:

```txt
idSeguimiento
idIncidencia
usuarioResponsable
comentario
estadoAnterior
estadoNuevo
fecha
```

## 10. Flujo de uso en la app

1. El ciudadano abre la app.
2. Se registra o inicia sesión.
3. Reporta una incidencia.
4. Adjunta imagen y ubicación.
5. El administrador valida la incidencia.
6. El administrador asigna el reporte a apoyo comunitario.
7. Apoyo comunitario actualiza avance.
8. Apoyo comunitario da solución.
9. Se cierra el reporte.
10. El ciudadano consulta el estatus y el historial.

## 11. Generar APK

En Android Studio:

1. Ir a `Build`.
2. Seleccionar `Build Bundle(s) / APK(s)`.
3. Elegir `Build APK(s)`.
4. Esperar a que compile.
5. Abrir la carpeta donde se generó el APK.

## 12. Recomendación final

Primero crear una app WebView para entregar una versión funcional rápida. Después evolucionar a una app nativa o híbrida con Firebase, cámara, ubicación y notificaciones reales.
