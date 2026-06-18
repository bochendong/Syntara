;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname lab-05-sol) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment 107/labs/lab-05)
(@cwl ...)

;; CPSC 107 - Sentence Tree Lab

(define TEXT-SIZE 10)

;; DATA DEFINITIONS ===============
;; Data definition for sentence tree
(@problem 1)
(@htdd SentenceTree ListOfSentenceTree)
(define-struct stree (prefix subs))
;; SentenceTree is (make-stree String ListOfSentenceTree)
;; interp. an arbitrary-arity SentenceTree
;; stree has prefix and a list of sub-SentenceTree's

;; ListOfSentenceTree is one of:
;;  - empty
;;  - (cons SentenceTree ListOfSentenceTree)
;; interp. a list of SentenceTree

(define ST1221 (make-stree "IN A BACK TO SCHOOL SPECIAL ABOUT MONO" empty))
(define ST1222 (make-stree "PERCHED ON THE TIP OF A SINKING SHIP" empty))

(define ST131 (make-stree "FREEZE TIME" empty))
(define ST132 (make-stree "MY FAVOURITE SONG ON REPEAT" empty))

(define ST121 (make-stree "YOU REALLY MEAN IT" empty))
(define ST122 (make-stree "WE ARE" (list ST1221 ST1222)))

(define ST11 (make-stree "JOKING ABOUT JEALOUSY" empty))
(define ST12 (make-stree "LIKE" (list ST121 ST122)))
(define ST13 (make-stree "TO" (list ST131 ST132)))

(define ST1 (make-stree "KISS ME" (list ST11 ST12 ST13)))

(@template-origin SentenceTree)

(define (fn-for-stree st)
  (... (stree-prefix st)
       (fn-for-lost (stree-subs st))))

(@template-origin ListOfSentenceTree)

(define (fn-for-lost lost)
  (cond [(empty? lost) (...)]
        [else
         (... (fn-for-stree (first lost))
              (fn-for-lost (rest lost)))]))


;; FUNCTIONS ======================
;; count-sentences
(@problem 2)
(@htdf count-sents--st count-sents--lost)
(@signature SentenceTree -> Natural)
(@signature ListOfSentenceTree -> Natural)
; count the number of the sentences
(check-expect (count-sents--lost empty) 0)
(check-expect (count-sents--lost (list ST11)) 1)
(check-expect (count-sents--lost (list ST11 ST12 ST13)) 6)
(check-expect (count-sents--lost (list ST11 ST131)) 2)
(check-expect (count-sents--st ST11) 1)
(check-expect (count-sents--st ST12) 3)
(check-expect (count-sents--st ST1) 6)

; (define (sentence-count st) 0) ; stub

(@template-origin SentenceTree)

(@template
 (define (count-sents--st st)
   (... (stree-prefix st)
        (fn-for-lost (stree-subs st)))))

(define (count-sents--st st)
  (+ (if (empty? (stree-subs st))
         1 0)
     (count-sents--lost (stree-subs st))))



(@template-origin ListOfSentenceTree)

(@template
 (define (fn-for-lost lost)
   (cond [(empty? lost) (...)]
         [else
          (... (fn-for-stree (first lost))
               (fn-for-lost (rest lost)))])))

(define (count-sents--lost lost)
  (cond [(empty? lost) 0]
        [else
         (+ (count-sents--st (first lost))
            (count-sents--lost (rest lost)))]))



;; render
(@problem 3)
(@htdf render--st render--lost)
(@signature SentenceTree -> Image)
(@signature ListOfSentenceTree -> Image)
;; render SentenceTree or ListOfTree as an image
(check-expect (render--st (make-stree "" empty))
              (text "" TEXT-SIZE "black"))
(check-expect (render--st (make-stree "1112223" empty))
              (text "1112223" TEXT-SIZE "black"))
(check-expect (render--lost empty) empty-image)
(check-expect (render--st ST12)
              (beside (text "LIKE" TEXT-SIZE "black")
                     (above/align "left" (render--st ST121)
                             (render--st ST122))))
(check-expect (render--st ST1)
              (beside (text "KISS ME" TEXT-SIZE "black")
                      (render--lost (list ST11 ST12 ST13))))

;(define (render--lost lost)empty-image) ;stub


(@template-origin SentenceTree)
(@template
 (define (render--st st)
   (... (stree-prefix st)
        (render--lost (stree-subs st)))))

(define (render--st st)
  (beside (text (stree-prefix st) TEXT-SIZE "black")
          (render--lost (stree-subs st))))

(@template-origin ListOfSentenceTree)
(@template
 (define (render--lost lost)
   (cond [(empty? lost) (...)]
         [else
          (... (render--st (first lost))
               (render--lost (rest lost)))])))

(define (render--lost lost)
  (cond [(empty? lost) empty-image]
        [else
         (above/align "left" (render--st (first lost))
                (render--lost (rest lost)))]))