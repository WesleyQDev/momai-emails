param(
    [Parameter(Mandatory=$true)][string]$PdfPath,
    [Parameter(Mandatory=$true)][string]$PngPath,
    [int]$Width = 400
)

$ErrorActionPreference = 'Stop'

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    
    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    }

    function Await-WinRtTask($Task, $Type) {
        $m = $asTaskGeneric.MakeGenericMethod($Type)
        $t = $m.Invoke($null, @($Task))
        $t.Wait(-1) | Out-Null
        return $t.Result
    }

    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null

    $resolvedPdf = (Resolve-Path $PdfPath).Path
    $file = Await-WinRtTask ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedPdf)) ([Windows.Storage.StorageFile])
    $doc = Await-WinRtTask ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])

    if ($doc.PageCount -eq 0) {
        Write-Error "PDF has no pages"
        exit 1
    }

    $page = $doc.GetPage(0)
    $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $options.DestinationWidth = [uint32]$Width

    $renderOp = $page.RenderToStreamAsync($stream, $options)
    $asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
    }
    $renderTask = $asTaskAction.Invoke($null, @($renderOp))
    $renderTask.Wait(-1) | Out-Null

    $size = [uint32]$stream.Size
    $bytes = New-Object byte[] $size
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    
    $loadOp = $reader.LoadAsync($size)
    $loadTask = $asTaskGeneric.MakeGenericMethod([uint32]).Invoke($null, @($loadOp))
    $loadTask.Wait(-1) | Out-Null
    
    $reader.ReadBytes($bytes)
    [System.IO.File]::WriteAllBytes($PngPath, $bytes)
    Write-Output "OK"
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
