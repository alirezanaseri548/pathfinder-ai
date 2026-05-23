"use client";

import { useState, useCallback } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

export default function DownloadPdf({
  contentRefId,
  fileName = "document.pdf",
  label = "Download PDF",
  variant = "outline",
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);

    try {
      const element = document.getElementById(contentRefId);
      if (!element) {
        console.error(`Element with id "${contentRefId}" not found`);
        return;
      }

      // Capture element as PNG using browser's native renderer (supports oklch)
      const dataUrl = await toPng(element, {
        quality: 0.98,
        pixelRatio: 2,
      });

      // Convert PNG to PDF
      const imgWidth = element.offsetWidth;
      const imgHeight = element.offsetHeight;

      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const maxWidth = pdfWidth - margin * 2;
      const maxHeight = pdfHeight - margin * 2;

      const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
      const finalWidth = imgWidth * ratio;
      const finalHeight = imgHeight * ratio;

      const x = (pdfWidth - finalWidth) / 2;
      const y = margin;

      pdf.addImage(dataUrl, "JPEG", x, y, finalWidth, finalHeight);
      pdf.save(fileName);
    } catch (error) {
      console.error("PDF generation failed:", error);
    } finally {
      setDownloading(false);
    }
  }, [contentRefId, fileName, downloading]);

  return (
    <Button variant={variant} onClick={handleDownload} disabled={downloading}>
      {downloading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      {downloading ? "Generating..." : label}
    </Button>
  );
}