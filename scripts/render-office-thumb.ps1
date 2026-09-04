param(
    [string]$DocPath,
    [string]$OutPngPath
)

$ErrorActionPreference = 'Stop'

function Render-Docx($path, $pngOut) {
    $tempPdf = [System.IO.Path]::ChangeExtension($path, [System.Guid]::NewGuid().ToString() + '.temp.pdf')
    $word = $null
    $doc = $null
    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $word.DisplayAlerts = 0
        $doc = $word.Documents.Open($path, $false, $true)
        # wdFormatPDF = 17
        $doc.SaveAs([ref]$tempPdf, [ref]17)
        $doc.Close([ref]$false)
        $word.Quit([ref]$false)
        $doc = $null
        $word = $null

        # Now render $tempPdf using render-pdf-thumb.ps1
        $pdfScript = Join-Path $PSScriptRoot "render-pdf-thumb.ps1"
        & $pdfScript -PdfPath $tempPdf -PngPath $pngOut -Width 400
        Write-Output "DOCX_SUCCESS"
    } finally {
        if ($doc) { try { $doc.Close([ref]$false) } catch {} }
        if ($word) { try { $word.Quit([ref]$false) } catch {} }
        if (Test-Path $tempPdf) { Remove-Item $tempPdf -Force -ErrorAction SilentlyContinue }
    }
}

function Render-Xlsx($path, $pngOut) {
    $tempPdf = [System.IO.Path]::ChangeExtension($path, [System.Guid]::NewGuid().ToString() + '.temp.pdf')
    $excel = $null
    $wb = $null
    try {
        $excel = New-Object -ComObject Excel.Application
        $excel.Visible = $false
        $excel.DisplayAlerts = $false
        $wb = $excel.Workbooks.Open($path, $false, $true)
        # xlTypePDF = 0
        $wb.ExportAsFixedFormat(0, $tempPdf)
        $wb.Close($false)
        $excel.Quit()
        $wb = $null
        $excel = $null

        # Now render $tempPdf using render-pdf-thumb.ps1
        $pdfScript = Join-Path $PSScriptRoot "render-pdf-thumb.ps1"
        & $pdfScript -PdfPath $tempPdf -PngPath $pngOut -Width 400
        Write-Output "XLSX_SUCCESS"
    } finally {
        if ($wb) { try { $wb.Close($false) } catch {} }
        if ($excel) { try { $excel.Quit() } catch {} }
        if (Test-Path $tempPdf) { Remove-Item $tempPdf -Force -ErrorAction SilentlyContinue }
    }
}

$ext = [System.IO.Path]::GetExtension($DocPath).ToLower()
if ($ext -in '.docx', '.doc', '.rtf', '.odt') {
    Render-Docx $DocPath $OutPngPath
} elseif ($ext -in '.xlsx', '.xls', '.csv') {
    Render-Xlsx $DocPath $OutPngPath
} else {
    Write-Error "Unsupported format: $ext"
}
