import './patchTypeScript'
import * as ts from 'typescript'

export type GetCompilerOptionsParams = {
  tsconfigName?: string
}

export type TsBenchmarkFilesHost = {
  files: TsBenchmarkFiles
  host: ts.CompilerHost
}

export type TsBenchmarkFiles = Record<string, string | undefined>

export type TsBenchmarkTypeChecker = ts.TypeChecker & {
  checkFileForBenchmark(file: ts.SourceFile): void
  getDiagnosticsForBenchmark(file: ts.SourceFile): ts.Diagnostic[]
}

export function getCompilerOptions({
  tsconfigName = 'tsconfig.json',
}: GetCompilerOptionsParams = {}) {
  const configFileName = ts.findConfigFile(
    "./",
    ts.sys.fileExists,
    tsconfigName,
  );
  if (!configFileName) {
    throw new Error("Failed to find tsconfig.json file");
  }

  const configFile = ts.readConfigFile(configFileName, ts.sys.readFile);

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    "./",
  );

  return parsedConfig.options;
}

export type CreateBenchmarkCompilerHostParams = {
  compilerOptions: ts.CompilerOptions
} | GetCompilerOptionsParams

export function createBenchmarkCompilerHost(params: CreateBenchmarkCompilerHostParams = {}) {
  const options = 'compilerOptions' in params ? params.compilerOptions : getCompilerOptions(params)

  const filesHost: TsBenchmarkFilesHost = {
    host: ts.createCompilerHost(options),
    files: {}
  }

  const originalGetSourceFile = filesHost.host.getSourceFile;
  filesHost.host.getSourceFile = (
    file,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    const content = filesHost.files?.[file]
    if (content) {
      return ts.createSourceFile(file, content, languageVersion);
    }

    return originalGetSourceFile(
      file,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  };

  return filesHost
}

type SetupTsBenchmarkParams = (SetupTsBenchmarkCompilerParams | GetCompilerOptionsParams) & {
  preparation?: string
  samples: string[] | Record<string, string>
}

type SetupTsBenchmarkCompilerParams = {
  compilerOptions?: ts.CompilerOptions
  filesHost?: TsBenchmarkFilesHost
}

const preparationFile = 'preparation-code.ts'

export function setupTsBenchmark(params: SetupTsBenchmarkParams) {
  const allParams = params as SetupTsBenchmarkCompilerParams & GetCompilerOptionsParams
  const compilerOptions = allParams.compilerOptions ?? getCompilerOptions(allParams)
  const host = allParams.filesHost ?? createBenchmarkCompilerHost({ compilerOptions })

  const rootNames = []

  const casesFilesMap = {
    ...(Array.isArray(params.samples)
      ? Object.fromEntries(params.samples.map((code, i) => [`${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i == 2 ? 'rd' : 'th'}.ts`, code]))
      : Object.fromEntries(Object.entries(params.samples).map(([key, code]) => [key.endsWith('.ts') ? key : `${key}.ts`, code])))
  }

  const casesFiles = Object.keys(casesFilesMap)

  host.files = {
    [preparationFile]: params.preparation,
    ...casesFilesMap,
  };

  if (params.preparation) {
    rootNames.push(preparationFile)
  }

  rootNames.push(...casesFiles)

  const program = ts.createProgram(rootNames, compilerOptions, host.host);

  const diagnostics = program.getSemanticDiagnostics()
  if (diagnostics.length) {
    logDiagnostics(diagnostics)
  }

  const typeChecker = program.getTypeChecker() as TsBenchmarkTypeChecker;

  const sourceFiles = casesFiles.map((file) => {
    const sourceFile = program.getSourceFile(file)
    if (!sourceFile) {
      throw new Error(`Failed to get ${file} source file`)
    }
    return sourceFile
  })

  for (const file of sourceFiles) {
    typeChecker.checkFileForBenchmark(file)
    const diagnostics = typeChecker.getDiagnosticsForBenchmark(file)
    if (diagnostics.length) {
      logDiagnostics(diagnostics)
    }
  }

  return {
    typeChecker,
    sourceFiles,
    program,
  }
}

type MeasureBaseParams = ({
  typeChecker: TsBenchmarkTypeChecker,
  sourceFiles: ts.SourceFile[]
} | SetupTsBenchmarkParams)

type MeasureTimeParams = {
  runTimes?: number
  log?: boolean,
} & MeasureBaseParams

export function measureTime({
  runTimes = 1000,
  log = true,
  ...params
}: MeasureTimeParams) {
  const { typeChecker, sourceFiles } = 'typeChecker' in params
    ? params
    : setupTsBenchmark(params)

  const samples = sourceFiles.length;
  const sample = sourceFiles.map(() => 0)

  for (let i = 0; i < runTimes; i++) {
    for (let s = 0; s < samples; s++) {
      const startTime = process.hrtime();
      typeChecker.checkFileForBenchmark(sourceFiles[s]);
      const endTime = process.hrtime(startTime);
      sample[s] += endTime[0] * 1000 + endTime[1] / 1e6
    }
  }

  const result = processResult(sourceFiles, sample)

  if (log) {
    const { max, minFile, maxFile } = getMinAndMax(samples, result);

    for (const key in result) {
      console.log(`${key}${
        samples > 1 && key !== maxFile ? ` +${Math.round(max * 100 / result[key]) / 100}x` : ''
      }${
        key === maxFile ? ' (slowest)' : key === minFile ? ' (fastest)' : ''
      }: ${Math.round(result[key])}ms`)
    }
  }

  return result
}

type MeasureSpeedParams = {
  durationMs?: number
  log?: boolean,
} & MeasureBaseParams

export function measureSpeed({
  durationMs = 100,
  log = true,
  ...params
}: MeasureSpeedParams) {
  const { typeChecker, sourceFiles } = 'typeChecker' in params
    ? params
    : setupTsBenchmark(params)

  const samples = sourceFiles.length
  const durations = sourceFiles.map(() => 0);
  const sample = [...durations]

  let active = samples
  for (;;) {
    for (let s = 0; s < samples; s++) {
      if (durations[s] > durationMs) continue

      const startTime = process.hrtime();

      typeChecker.checkFileForBenchmark(sourceFiles[s]);

      sample[s]++

      const endTime = process.hrtime(startTime);
      durations[s] += endTime[0] * 1000 + endTime[1] / 1e6
      if (durations[s] > durationMs) {
        active--
      }
    }

    if (!active) break
  }

  const result = processResult(sourceFiles, sample)

  if (log) {
    const { min, minFile, maxFile } = getMinAndMax(samples, result);

    const k = 1000 / durationMs
    for (const key in result) {
      console.log(`${key}${
        samples > 1 && key !== minFile ? ` +${Math.round(result[key] * 100 / min) / 100}x` : ''
      }${
        key === maxFile ? ' (fastest)' : key === minFile ? ' (slowest)' : ''
      }: ${formatNumber(result[key] * k)} ops/s`)
    }
  }

  return result
}

function getMinAndMax(samples: number, result: Record<string, number>) {
  let min = Infinity
  let minFile: string | undefined
  let max = 0
  let maxFile: string | undefined
  if (samples > 1) {
    for (const key in result) {
      const value = result[key]
      if (value < min) {
        min = value
        minFile = key
      }
      if (value > max) {
        max = value
        maxFile = key
      }
    }
  }

  return {
    min,
    minFile,
    max,
    maxFile,
  }
}

function logDiagnostics(diagnostics: readonly ts.Diagnostic[]) {
  const formattedDiagnostics = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (fileName: string) => fileName,
    getNewLine: () => ts.sys.newLine
  });

  console.log(formattedDiagnostics);
}

function formatNumber(num: number) {
  if (num < 1000) {
    return num.toString();
  } else if (num < 1000000) {
    return (num / 1000).toFixed(num % 1000 >= 100 ? 1 : 0) + 'k';
  } else {
    return (num / 1000000).toFixed(num % 1000000 >= 100000 ? 1 : 0) + 'm';
  }
}


function processResult(sourceFiles: { fileName: string }[], sample: number[]) {
  return Object.fromEntries(sourceFiles.map((file, i) => [file.fileName, sample[i]]))
}
