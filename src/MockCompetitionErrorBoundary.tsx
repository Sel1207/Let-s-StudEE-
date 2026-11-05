import { Component, type ErrorInfo, type ReactNode } from 'react'

const MOCK_SESSION_STORAGE_KEY = 'lets-studee-active-mock-session-v1'

interface MockCompetitionErrorBoundaryProps {
  children: ReactNode
}

interface MockCompetitionErrorBoundaryState {
  hasError: boolean
  recoveryError: string
}

export default class MockCompetitionErrorBoundary extends Component<MockCompetitionErrorBoundaryProps, MockCompetitionErrorBoundaryState> {
  state: MockCompetitionErrorBoundaryState = { hasError: false, recoveryError: '' }

  static getDerivedStateFromError(): MockCompetitionErrorBoundaryState {
    return { hasError: true, recoveryError: '' }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('The Mock Competition screen failed to render.', error, errorInfo)
  }

  clearActiveRun = () => {
    try {
      window.localStorage.removeItem(MOCK_SESSION_STORAGE_KEY)
      window.location.reload()
    } catch (error) {
      console.error('Could not clear the active Mock Competition run.', error)
      this.setState({ recoveryError: 'The active run could not be cleared. Check browser storage permissions and try again.' })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <section className="secondary-view competition-view" role="alert" aria-labelledby="competition-load-error-title">
        <p className="eyebrow">Mock Competition</p>
        <h1 id="competition-load-error-title">This competition could not be loaded</h1>
        <p>Your saved competitions and scores are still safe. Clear only the active run to return to setup.</p>
        {this.state.recoveryError && <p className="form-error">{this.state.recoveryError}</p>}
        <button className="primary-action" type="button" onClick={this.clearActiveRun}>Clear active run and reload</button>
      </section>
    )
  }
}
