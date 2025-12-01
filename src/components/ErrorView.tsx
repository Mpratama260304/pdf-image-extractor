import { motion } from 'framer-motion'
import { Warning, Download, ArrowLeft, Info } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DiagnosticInfo, downloadDiagnostic } from '@/lib/pdf-extractor'
import { Badge } from '@/components/ui/badge'

interface ErrorViewProps {
  errorCode: string
  errorMessage: string
  diagnostic?: DiagnosticInfo
  onRetry: () => void
  onBack: () => void
}

const errorMessages: Record<string, { title: string; description: string; tips: string[] }> = {
  FILE_TOO_LARGE: {
    title: 'File Terlalu Besar',
    description: 'File PDF yang Anda unggah melebihi batas ukuran maksimum.',
    tips: [
      'Kompres PDF menggunakan tools online seperti iLovePDF',
      'Bagi PDF menjadi beberapa file lebih kecil',
      'Gunakan Adobe Acrobat untuk mengurangi ukuran file'
    ]
  },
  NOT_PDF: {
    title: 'Bukan File PDF',
    description: 'File yang diunggah bukan dokumen PDF yang valid.',
    tips: [
      'Pastikan file memiliki ekstensi .pdf',
      'Coba ekspor ulang dokumen sebagai PDF',
      'Periksa apakah file tidak rusak saat diunduh'
    ]
  },
  INVALID_PDF: {
    title: 'PDF Tidak Valid',
    description: 'File PDF rusak atau menggunakan format yang tidak standar.',
    tips: [
      'Buka PDF di Adobe Reader dan save as dengan nama baru',
      'Gunakan PDF repair tool untuk memperbaiki file',
      'Ekspor ulang dokumen dari aplikasi aslinya'
    ]
  },
  PDF_ENCRYPTED: {
    title: 'PDF Terenkripsi',
    description: 'File PDF ini dilindungi dengan kata sandi atau memiliki enkripsi.',
    tips: [
      'Buka PDF dengan kata sandi dan ekspor ulang tanpa proteksi',
      'Gunakan tools PDF unlock jika Anda memiliki izin',
      'Minta versi tidak terenkripsi dari pengirim file'
    ]
  },
  PDF_LOAD_FAILED: {
    title: 'Gagal Memuat PDF',
    description: 'Tidak dapat memuat struktur PDF. File mungkin rusak atau menggunakan format khusus.',
    tips: [
      'Coba buka di Adobe Reader dan save as PDF 1.4 atau 1.7',
      'Gunakan "Print to PDF" dari aplikasi viewer untuk membuat file baru',
      'Jika file berasal dari scanner, coba scan ulang dengan output PDF standar',
      'Download diagnostic untuk melihat detail teknis lengkap'
    ]
  },
  TOO_MANY_PAGES: {
    title: 'Terlalu Banyak Halaman',
    description: 'PDF memiliki terlalu banyak halaman untuk diproses sekaligus.',
    tips: [
      'Bagi PDF menjadi beberapa bagian lebih kecil',
      'Proses halaman yang Anda butuhkan saja',
      'Gunakan PDF splitter untuk membagi dokumen'
    ]
  },
  NO_IMAGES: {
    title: 'Tidak Ada Gambar',
    description: 'Tidak ada gambar yang dapat diekstrak dari PDF ini.',
    tips: [
      'PDF mungkin hanya berisi teks',
      'Jika ada gambar visual, coba scan ulang dengan kualitas lebih tinggi',
      'Gunakan screenshot tool untuk capture halaman yang Anda butuhkan'
    ]
  },
  UNKNOWN_ERROR: {
    title: 'Kesalahan Tidak Diketahui',
    description: 'Terjadi kesalahan yang tidak terduga saat memproses PDF.',
    tips: [
      'Coba refresh halaman dan upload ulang',
      'Periksa koneksi internet Anda',
      'Gunakan browser terbaru (Chrome, Firefox, Edge)',
      'Download diagnostic dan laporkan ke tim support'
    ]
  }
}

export function ErrorView({ errorCode, errorMessage, diagnostic, onRetry, onBack }: ErrorViewProps) {
  const errorInfo = errorMessages[errorCode] || errorMessages.UNKNOWN_ERROR

  const handleDownloadDiagnostic = () => {
    if (diagnostic) {
      downloadDiagnostic(diagnostic)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 md:px-12 py-12"
    >
      <Card className="max-w-2xl w-full glass-effect border-destructive/50">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/20 shrink-0">
              <Warning weight="fill" className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-2xl mb-2 flex items-center gap-2">
                {errorInfo.title}
                <Badge variant="destructive" className="text-xs font-mono">
                  {errorCode}
                </Badge>
              </CardTitle>
              <CardDescription className="text-base">
                {errorInfo.description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-sm">
              {errorMessage}
            </AlertDescription>
          </Alert>

          {diagnostic && (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Informasi File:</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Nama File</p>
                  <p className="font-medium truncate">{diagnostic.originalFilename}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Ukuran</p>
                  <p className="font-medium">{(diagnostic.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Jumlah Halaman</p>
                  <p className="font-medium">{diagnostic.pageCount || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Durasi Proses</p>
                  <p className="font-medium">{(diagnostic.duration / 1000).toFixed(2)}s</p>
                </div>
                {diagnostic.pdfVersion && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">Versi PDF</p>
                    <p className="font-medium font-mono">{diagnostic.pdfVersion}</p>
                  </div>
                )}
                {diagnostic.fileMd5 && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">File Hash (SHA-256)</p>
                    <p className="font-medium font-mono text-xs truncate">{diagnostic.fileMd5.substring(0, 16)}...</p>
                  </div>
                )}
              </div>

              {diagnostic.autoRepairUsed && (
                <Alert className="bg-accent/10 border-accent/30">
                  <Info className="w-4 h-4 text-accent" />
                  <AlertDescription className="text-sm">
                    <span className="font-semibold">Auto-Repair Digunakan:</span> {diagnostic.autoRepairUsed}
                  </AlertDescription>
                </Alert>
              )}

              {diagnostic.attempts.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="font-semibold text-sm">Metode yang Dicoba:</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {diagnostic.attempts.map((attempt, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className={attempt.success ? 'text-green-500' : 'text-red-500'}>
                          {attempt.success ? '✓' : '✗'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-muted-foreground">{attempt.method}</span>
                          {attempt.duration !== undefined && (
                            <span className="text-muted-foreground/70"> ({attempt.duration}ms)</span>
                          )}
                          {attempt.imageCount !== undefined && (
                            <span className="text-muted-foreground"> - {attempt.imageCount} gambar</span>
                          )}
                          {attempt.error && (
                            <div className="text-red-400/80 text-xs mt-0.5 truncate" title={attempt.error}>
                              {attempt.error}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Saran Perbaikan:</h4>
            <ul className="space-y-2">
              {(diagnostic?.recommendations && diagnostic.recommendations.length > 0 
                ? diagnostic.recommendations 
                : errorInfo.tips
              ).map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-accent shrink-0">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={onRetry} className="flex-1" variant="outline">
              <ArrowLeft weight="bold" className="w-4 h-4 mr-2" />
              Coba File Lain
            </Button>
            {diagnostic && (
              <Button onClick={handleDownloadDiagnostic} className="flex-1" variant="secondary">
                <Download weight="bold" className="w-4 h-4 mr-2" />
                Download Diagnostic
              </Button>
            )}
          </div>

          <Button onClick={onBack} variant="ghost" className="w-full">
            Kembali ke Beranda
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
