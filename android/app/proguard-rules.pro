# Start.io (StartApp) ProGuard rules
-keepattributes Exceptions, InnerClasses, Signature, Deprecated, SourceFile, LineNumberTable, *Annotation*, EnclosingMethod
-dontwarn com.startapp.**
-keep class com.startapp.** { *; }
-keep interface com.startapp.** { *; }

# AndroidX WebKit ProGuard rules
-dontwarn androidx.webkit.**
-keep class androidx.webkit.** { *; }
