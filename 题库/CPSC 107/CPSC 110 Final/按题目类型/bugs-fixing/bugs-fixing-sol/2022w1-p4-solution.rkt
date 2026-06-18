;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.

(require spd/tags)

(@assignment exams/2022w1-f/f-p4);Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


(@htdd Team)
(define-struct team (name rank continent))
;; Team is (make-team String Natural String)
;; interp. a team that is trying to qualify for the 2022 FIFA World cup
;;         country name of the team
;;         rank of the team, smaller value indicates higher ranking
;;         continent for the team

(define ARG (make-team "Argentina"    5  "SA"))
(define BRA (make-team "Brazil"       2  "SA"))

(define FRC (make-team "France"       1  "EU"))  ; best team
(define NET (make-team "Netherlands"  3  "EU"))

(define CAN (make-team "Canada"      20  "NA"))
(define USA (make-team "USA"         12  "NA"))

(define NGA (make-team "Nigeria"      2  "AF"))
(define MOR (make-team "Morocco"     15  "AF"))

(define (fn-for-team t)
  (... (team-name t)
       (team-rank t)
       (team-continent t)))


(@htdd Game)
(define-struct game (home away))
;; Game is (make-game Team Team)
;; interp. a game that is being played between two nations
;;         home is the Team that is hosting the game
;;         away is the Team that is visiting
(define G1 (make-game ARG FRC))
(define G2 (make-game ARG MOR))
(define G3 (make-game NET CAN))
(define G4 (make-game USA FRC))
(define G5 (make-game NGA FRC))
(define G6 (make-game NGA NET))
(define G7 (make-game BRA NET))

(define (fn-for-game g)
  (... (fn-for-team (game-home g))           ;BUG 1 include calls to fn-for-team
       (fn-for-team (game-away g))))

(@htdf continent-predicted-wins)
(@signature String (listof Game) -> Natural) ;BUG 2 change Integer to Natural
;; produce count of predicted wins played by a country from a given continent
(check-expect (continent-predicted-wins "AF" empty) 0)
(check-expect (continent-predicted-wins "SA" (list G1 G2 G3 G4 G5 G6 G7)) 2) 

(@template-origin (listof Game))             ;BUG 3 remove String from origins

(define (continent-predicted-wins c log)
  (cond [(empty? log) 0]
        [else
         (if (win-for-continent? c (first log))
             (add1 (continent-predicted-wins c (rest log)))
             (continent-predicted-wins c (rest log)))]))



(@htdf win-for-continent?)
(@signature String Game -> Boolean)
;; produce true if a team from given continent has higher rank than opponent 
(check-expect (win-for-continent? "EU" G2) false)
(check-expect (win-for-continent? "NA" G3) false)
(check-expect (win-for-continent? "SA" G4) false)
(check-expect (win-for-continent? "AF" G6) true)
(check-expect (win-for-continent? "EU" G1) true) ;BUG 4 detects BUG 5

(@template-origin Game)

(define (win-for-continent? c g)
  (or (and (from-continent? c (game-home g))
           (< (team-rank (game-home g))
              (team-rank (game-away g))))
      (and (from-continent? c (game-away g))     ;BUG 5 game-home -> game-away
           (< (team-rank (game-away g))
              (team-rank (game-home g))))))


(@htdf from-continent?)
(@signature String Team -> Boolean) 
;; produce true if the team is from the given continent
(check-expect (from-continent? "AF" NGA) true)
(check-expect (from-continent? "AF" CAN) false)
(check-expect (from-continent? "EU" CAN) false)  ;BUG 6  tests to detect bug 7
(check-expect (from-continent? "EU" NET) true)   ;

(@template-origin Team)

(define (from-continent? c t)
  (string=? (team-continent t) c))               ;BUG 7  replace "AF" w/ c

