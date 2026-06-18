;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w1-f/f-p5)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag
(@problem 3) ;do not edit or delete this tag
(@problem 4) ;do not edit or delete this tag
(@problem 5) ;do not edit or delete this tag

#|

Data definitions:

|#

(@htdd Room)
(@htdd Stairs)
(define-struct room (name los))
(define-struct stairs (label number to-room-name))
;;
;; Room is (make-room String (listof Stairs))
;; Stairs is (make-stairs String Natural String)
;;
;; interp.
;;  Rooms have a name and a list of the stairs leading AWAY from that room.
;; 
;;  Stairs have a label, a number of steps, and the name of the room they 
;;  lead to. The label of stairs are always formed the same way are are
;;  intended to describe where they fit in the graph - a stairs with 4 steps
;;  that leads from room "A" to room "C" will have label "a-4-c".
;;


(@template-origin encapsulated Room (listof Stairs) Stairs genrec)

(define (fn-for-haunted-house from)
  ;; trivial case:
  ;; reduction step:
  ;; proof of termination:
  (local [(define (fn-for-room rm)
            (... (room-name rm)
                 (fn-for-los (room-los rm))))

          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-stairs (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-stairs strs)
            (... (stairs-label strs)
                 (stairs-number strs)
                 (fn-for-room (get-room (stairs-to-room-name strs)))))]

    (fn-for-room (get-room from))))



(@htdf find-easiest-increasing-path-tr)
(@signature String String -> (listof String) or false)

(check-expect (find-easiest-increasing-path-tr "Z" "G") false)
(check-expect (find-easiest-increasing-path-tr "E" "B") false)

(check-expect (find-easiest-increasing-path-tr "A" "A") empty)
(check-expect (find-easiest-increasing-path-tr "D" "D") empty)
(check-expect (find-easiest-increasing-path-tr "B" "B") empty)

(check-expect (find-easiest-increasing-path-tr "A" "F") (list "a-2-c" "c-3-f"))
(check-expect (find-easiest-increasing-path-tr "A" "Z") (list "a-2-c"
                                                              "c-3-f"
                                                              "f-6-z"))
(check-expect (find-easiest-increasing-path-tr "A" "G") (list "a-4-d" "d-6-g"))

(check-expect (find-easiest-increasing-path-tr "A" "E") (list "a-4-b" "b-5-e"))
(check-expect (find-easiest-increasing-path-tr "D" "Z") (list "d-4-f" "f-6-z"))
(check-expect (find-easiest-increasing-path-tr "E" "Z") (list "e-3-z"))

;(define (find-easiest-increasing-path-tr from to) false) ;stub

(@template-origin encapsulated
           Room (listof Stairs) Stairs ;original types
           genrec                      ;get-room is generative
           accumulator)                ;path
;;                                     ;tr so no try-catch for failure handling

(@template-origin encapsulated Room (listof Stairs) Stairs genrec accumulator)

(define (find-easiest-increasing-path-tr from to)
  ;; trivial: find to room, or encounter stairs on path a 2nd time
  ;; reduction: at stairs, traverse room w/ given name
  ;; argument: house is finite, we never visit a stairs twice, so will terminate

  ;; MUST HAVE this INFORMATION:
  ;; - some sort of primary worklist Stairs easiest, Room can work
  ;;   Even if primary is (listof Room), next two bullets must be (listof Stairs) based
  ;; - stairs travelled based path information to each element of primary worklist, including
  ;;      - stair labels              in each path
  ;;      - total number of steps     in each path
  ;;      - #steps of the last stairs in each path
  ;; - either best path so far or all paths so far with above for each path
  ;;
  ;; There are many ways to represent that information.  The simplest is for the primary
  ;; worklist to be (listof Stairs).  With that possible secondary worklist combinations include:  
  ;;    *    keep (listof (listof Stairs))                                   ;keeps all three values in one
  ;;    * or keep (listof (listof String)) (listof (listof Natural))         ;naturals are #steps for each stair
  ;;    * or keep (listof (listof String)) (listof Natural) (listof Natural) ;naturals sum-of

  ;; strs-wl is (listof Stairs); primary worklist
  ;; path-wl is (listof (listof Stairs)); tandem worklist for path
  ;; rsf     is one of false | (listof Stairs); easiest increasing path so far  
  (local [(define (fn-for-room rm path strs-wl path-wl rsf)
            (if (string=? (room-name rm) to)
                (fn-for-los strs-wl path-wl (choose rsf path))
                (fn-for-los (append (room-los rm)
                                    strs-wl)
                            (append (make-list (length (room-los rm)) path)
                                    path-wl)
                            rsf)))

          (define (fn-for-los strs-wl path-wl rsf)
            (cond [(empty? strs-wl) (if (false? rsf)
                                        false 
                                        (map stairs-label (reverse rsf)))]
                  [else
                   (fn-for-stairs (first strs-wl)
                                  (first path-wl)
                                  (rest strs-wl)
                                  (rest path-wl)
                                  rsf)]))

          (define (fn-for-stairs strs path strs-wl path-wl rsf)
            (cond [(member strs path) (fn-for-los strs-wl path-wl rsf)]
                  [(and (not (empty? path))
                        (<= (stairs-number strs)
                            (stairs-number (first path))))
                   (fn-for-los strs-wl path-wl rsf)]
                  [else
                   (fn-for-room (get-room (stairs-to-room-name strs))
                                (cons strs path)
                                strs-wl
                                path-wl
                                rsf)]))
          
          (define (choose rsf path)
            (cond [(false? rsf) path]
                  [else
                   (if (< (foldr + 0 (map stairs-number path))
                          (foldr + 0 (map stairs-number rsf)))
                       path
                       rsf)]))]

    (fn-for-room (get-room from) empty empty empty false)))


;; ****
;;
;; Below here is the definition of get-room.  You should treat it as a primitive
;; function described above, and should not look at its definition.
;;

(define HOUSE '(("A" ((4 "B") (2 "C") (4 "D")))
                ("B" ((5 "E") (5 "F")))
                ("C" ((3 "F")))
                ("D" ((4 "F") (6 "G")))
                ("E" ((6 "A") (3 "Z")))
                ("F" ((6 "Z")))
                ("G" ((7 "Z")))
                ("Z" ())))

  
(define (get-room name)
  (local [(define entry (assoc name HOUSE))]
    (if (false? entry)
        (error "No room with name " name)
        (make-room (first entry)
                   (map (lambda (args)
                          (make-stairs
                           (string-downcase
                            (string-append (first entry)
                                           "-"
                                           (number->string (first args))
                                           "-"
                                           (second args)))
                           (first args)
                           (second args)))
                        (second entry))))))
