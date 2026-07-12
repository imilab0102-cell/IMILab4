package com.imilab.app;

import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "FunPrint")
public class FunPrintPlugin extends Plugin {

    @PluginMethod
    public void saveImageToGallery(PluginCall call) {
        String base64Image = call.getString("image");
        String fileName = call.getString("filename", "IMILab_Order.jpg");

        if (base64Image == null) {
            call.reject("Image data is missing");
            return;
        }

        try {
            if (base64Image.contains(",")) {
                base64Image = base64Image.split(",")[1];
            }

            byte[] decodedString = Base64.decode(base64Image, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(decodedString, 0, decodedString.length);

            boolean success = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Новий метод для Android 10+ (без дозволів)
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/IMILab");

                Uri uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                        success = bitmap.compress(Bitmap.CompressFormat.JPEG, 100, out);
                    }
                }
            } else {
                // Старий метод для Android 9 і нижче
                File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "IMILab");
                if (!directory.exists()) directory.mkdirs();
                File file = new File(directory, fileName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    success = bitmap.compress(Bitmap.CompressFormat.JPEG, 100, out);
                }
                // Оновити галерею
                Intent intent = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
                intent.setData(Uri.fromFile(file));
                getContext().sendBroadcast(intent);
            }

            if (success) {
                call.resolve();
            } else {
                call.reject("Failed to save image");
            }
        } catch (Exception e) {
            call.reject("Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void printImage(PluginCall call) {
        String base64Image = call.getString("image");
        if (base64Image == null) {
            call.reject("Image data is missing");
            return;
        }

        try {
            if (base64Image.contains(",")) {
                base64Image = base64Image.split(",")[1];
            }

            byte[] decodedString = Base64.decode(base64Image, Base64.DEFAULT);
            
            File cachePath = new File(getContext().getCacheDir(), "images");
            if (!cachePath.exists()) {
                cachePath.mkdirs();
            }
            File file = new File(cachePath, "case_receipt.jpg");
            FileOutputStream stream = new FileOutputStream(file);
            stream.write(decodedString);
            stream.close();

            Uri contentUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("image/jpeg");
            intent.putExtra(Intent.EXTRA_STREAM, contentUri);
            intent.setPackage("com.fun.mxw"); 
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            try {
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                intent.setPackage("com.phucynwa.mini.portable.cat.printer");
                try {
                    getContext().startActivity(intent);
                    call.resolve();
                } catch (Exception e2) {
                    Intent shareIntent = Intent.createChooser(intent, "Поділитися чеком");
                    shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(shareIntent);
                    call.resolve();
                }
            }
        } catch (Exception e) {
            call.reject("Error processing image: " + e.getMessage());
        }
    }

    @PluginMethod
    public void savePdfToFile(PluginCall call) {
        String base64Data = call.getString("data");
        String fileName = call.getString("filename", "Report.pdf");

        if (base64Data == null) {
            call.reject("PDF data is missing");
            return;
        }

        try {
            if (base64Data.contains(",")) {
                base64Data = base64Data.split(",")[1];
            }

            byte[] decodedString = Base64.decode(base64Data, Base64.DEFAULT);
            
            File cachePath = new File(getContext().getCacheDir(), "documents");
            if (!cachePath.exists()) {
                cachePath.mkdirs();
            }
            File file = new File(cachePath, fileName);
            FileOutputStream stream = new FileOutputStream(file);
            stream.write(decodedString);
            stream.close();

            Uri contentUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/pdf");
            intent.putExtra(Intent.EXTRA_STREAM, contentUri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            Intent shareIntent = Intent.createChooser(intent, "Зберегти або надіслати звіт");
            shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(shareIntent);
            
            call.resolve();
        } catch (Exception e) {
            call.reject("Error processing PDF: " + e.getMessage());
        }
    }

    @PluginMethod
    public void captureAndPrint(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                Bitmap bitmap = Bitmap.createBitmap(webView.getWidth(), webView.getHeight(), Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);
                webView.draw(canvas);

                File cachePath = new File(getContext().getCacheDir(), "images");
                if (!cachePath.exists()) cachePath.mkdirs();
                
                File file = new File(cachePath, "screenshot_receipt.jpg");
                FileOutputStream ostream = new FileOutputStream(file);
                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, ostream);
                ostream.close();

                Uri contentUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);

                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("image/jpeg");
                intent.putExtra(Intent.EXTRA_STREAM, contentUri);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                intent.setPackage("com.fun.mxw");
                try {
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    intent.setPackage("com.phucynwa.mini.portable.cat.printer");
                    try {
                        getContext().startActivity(intent);
                    } catch (Exception e2) {
                        Intent shareIntent = Intent.createChooser(intent, "Поділитися чеком");
                        shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(shareIntent);
                    }
                }
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }
}
